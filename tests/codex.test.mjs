// The Codex host: hooks arrive with a different tool name for file writes (apply_patch, patch text in tool_input.command),
// a Bash hook with no `if` filter (hooks/codex-guard.sh decides whether Node starts), and no CLAUDE_PROJECT_DIR (payload.cwd is the project).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parsePatch } from "../scripts/lib/lint.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.join(here, "..");
const rec = JSON.parse(fs.readFileSync(path.join(here, "recordings", "live-2026-10-20.json"), "utf8"));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tdp-codex-")));
let fail = 0;
let n = 0;
const check = (name, ok, detail = "") => {
  n++;
  if (!ok) {
    fail++;
    console.log(`FAIL ${name} ${detail}`);
  }
};

const root = path.join(tmp, "app");
fs.mkdirSync(path.join(root, "src", "trigger"), { recursive: true });
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app", private: true, dependencies: { "@trigger.dev/sdk": "4.8.1" } }));
fs.writeFileSync(path.join(root, "trigger.config.ts"), 'import { defineConfig } from "@trigger.dev/sdk";\nexport default defineConfig({ project: "proj_fixturefixture", dirs: ["./src/trigger"] });\n');
const data = path.join(tmp, "data");
const env = { ...process.env, PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, PLUGIN_DATA: data };
delete env.CLAUDE_PROJECT_DIR;
delete env.CLAUDE_PLUGIN_OPTION_STEERING;
delete env.TRIGGER_API_URL;
const run = (cmd, args, payload) => spawnSync(cmd, args, { cwd: tmp, env, input: JSON.stringify(payload), encoding: "utf8", timeout: 15000 }).stdout || "";
const base = { session_id: "cx", cwd: root, model: "gpt", permission_mode: "default" };

// parsePatch: Add keeps null (all new), Update keeps its "+" blocks, paths resolve against cwd, Move renames the entry.
const patch = "*** Begin Patch\n*** Add File: src/trigger/new.ts\n+a\n+b\n*** Update File: old.ts\n@@\n-x\n+y\n z\n+q\n*** End Patch";
const parsed = parsePatch(patch, root);
check("parsePatch: add file", parsed[0].file === path.join(root, "src/trigger/new.ts") && parsed[0].added === null, JSON.stringify(parsed));
check("parsePatch: update blocks", parsed[1].file === path.join(root, "old.ts") && JSON.stringify(parsed[1].added) === '["y","q"]', JSON.stringify(parsed[1]));

// SessionStart: the Codex hook command prints the facts from payload.cwd.
const ss = run("sh", [path.join(plugin, "hooks", "session-start.sh")], { ...base, hook_event_name: "SessionStart" });
check("SessionStart finds the project from payload.cwd", ss.includes("Trigger.dev project facts"), ss.slice(0, 200));

// PostToolUse: apply_patch adding a file with a known-bad pattern; the gate has the marker from SessionStart.
const file = path.join(root, rec.tripwire.file);
fs.writeFileSync(file, rec.tripwire.content);
const addPatch = `*** Begin Patch\n*** Add File: ${rec.tripwire.file}\n${rec.tripwire.content.split("\n").map((l) => `+${l}`).join("\n")}\n*** End Patch`;
const lint = run("sh", [path.join(plugin, "hooks", "marker-gate.sh"), "lint", "--hook"], { ...base, hook_event_name: "PostToolUse", tool_name: "apply_patch", tool_input: { command: addPatch } });
check("apply_patch Add File: tripwire names the hit", lint.includes("src/trigger/bad.ts:7") && lint.includes("Promise.all"), lint.slice(0, 300));

// An Update that touches an unrelated line: the old hit is labelled as not from this change.
const upd = rec.tripwire.content.replace('id: "bad"', 'id: "bad2"');
fs.writeFileSync(file, upd);
const updPatch = `*** Begin Patch\n*** Update File: ${rec.tripwire.file}\n@@\n-  id: "bad",\n+  id: "bad2",\n*** End Patch`;
const lint2 = run("sh", [path.join(plugin, "hooks", "marker-gate.sh"), "lint", "--hook"], { ...base, session_id: "cx2", hook_event_name: "PostToolUse", tool_name: "apply_patch", tool_input: { command: updPatch } });
check("apply_patch Update File: old hit is labelled", lint2.includes("none in this edit") && lint2.includes("Already in this file"), lint2.slice(0, 300));

// PreToolUse Bash: a trigger deploy with no --env asks; unrelated commands cost nothing and print nothing.
const bash = (command) => run("sh", [path.join(plugin, "hooks", "codex-guard.sh")], { ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
check("codex-guard: deploy without --env asks", bash("npx trigger.dev@latest deploy").includes('"permissionDecision":"ask"'));
check("codex-guard: deploy --env staging is silent", bash("npx trigger.dev@latest deploy --env staging") === "");
check("codex-guard: unrelated command is silent", bash("ls -la") === "");
check("codex-guard: Codex MCP tool name is guarded", run("node", [path.join(plugin, "scripts", "trigger-ctx.mjs"), "guard"], { ...base, tool_name: "mcp__trigger__deploy", tool_input: { environment: "prod" } }).includes('"permissionDecision":"ask"'));

// The generated Codex hooks only name files that exist.
const hooks = fs.readFileSync(path.join(plugin, "hooks", "codex-hooks.json"), "utf8");
for (const m of hooks.matchAll(/\$\{PLUGIN_ROOT\}\/([\w./-]+)/g)) check(`codex-hooks.json file exists: ${m[1]}`, fs.existsSync(path.join(plugin, m[1])));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${fail ? "FAILED" : "ok"}: ${n} codex checks, ${fail} failures`);
process.exitCode = fail ? 1 : 0;
