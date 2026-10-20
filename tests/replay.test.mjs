// Replays what real Claude Code sessions sent to the three hooks and checks the plugin still answers byte for byte
// what it answered then (tests/recordings/*.json, captured with --include-hook-events). Inputs go in through a pipe
// that is written after a delay, as the harness does, through the same entry points the harness runs (sh scripts, node engine).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.join(here, "..");
const rec = JSON.parse(fs.readFileSync(path.join(here, "recordings", "live-2026-10-20.json"), "utf8"));

// A project shaped like the sandbox one the sessions ran in.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "tdp-replay-"));
const data = fs.mkdtempSync(path.join(os.tmpdir(), "tdp-replay-data-"));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
put("package.json", JSON.stringify({ name: "fx-min", private: true, scripts: { "deploy:trigger": "trigger deploy" }, dependencies: { "@trigger.dev/sdk": "4.7.4" }, devDependencies: { "@trigger.dev/build": "4.7.4" } }));
put("trigger.config.ts", 'import { defineConfig } from "@trigger.dev/sdk";\nexport default defineConfig({ project: "proj_fixturefixture", dirs: ["./src/trigger"], maxDuration: 300 });\n');
put("node_modules/@trigger.dev/sdk/package.json", JSON.stringify({ name: "@trigger.dev/sdk", version: "4.7.4" }));
put("node_modules/@trigger.dev/build/package.json", JSON.stringify({ name: "@trigger.dev/build", version: "4.7.4" }));
put("node_modules/@trigger.dev/sdk/docs/introduction.mdx", "# stub\n");
put("package-lock.json", "{}");

const env = { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data };
delete env.CLAUDE_PLUGIN_OPTION_STEERING;
delete env.TRIGGER_API_URL;

function run(cmd, args, stdin) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ out, err, code }));
    setTimeout(() => p.stdin.end(stdin ?? ""), 250);
  });
}
const same = (got, want) => JSON.stringify(JSON.parse(got)) === JSON.stringify(JSON.parse(want.replaceAll("__ROOT__", root)));
const hookInput = (event, extra) => JSON.stringify({ session_id: "replay", cwd: root, hook_event_name: event, ...extra });

let fail = 0;
const check = (name, ok, detail = "") => {
  if (!ok) { fail++; console.log(`FAIL ${name} ${detail}`); }
};

const ss = await run("sh", [path.join(plugin, "hooks", "session-start.sh")], hookInput("SessionStart", {}));
check("SessionStart context equals the recording", ss.code === 0 && ss.out.trim() && same(ss.out, rec.sessionStart.output), `got: ${ss.out.slice(0, 300)} ${ss.err.slice(0, 200)}`);

for (const g of rec.guard) {
  const r = await run("node", [path.join(plugin, "scripts", "trigger-ctx.mjs"), "guard"], hookInput("PreToolUse", { permission_mode: g.permission_mode, tool_name: g.tool_name, tool_input: g.tool_input, tool_use_id: "toolu_replay" }));
  check(`guard: ${g.name}`, r.out.trim() && same(r.out, g.output), `got: ${r.out.slice(0, 300)} ${r.err.slice(0, 200)}`);
}

put(rec.tripwire.file, rec.tripwire.content);
const tw = await run("sh", [path.join(plugin, "hooks", "marker-gate.sh"), "lint", "--hook"], hookInput("PostToolUse", { tool_name: "Write", tool_input: { file_path: path.join(root, rec.tripwire.file), content: rec.tripwire.content }, tool_response: { type: "create", filePath: path.join(root, rec.tripwire.file) } }));
check("tripwire output equals the recording", tw.out.trim() && same(tw.out, rec.tripwire.output), `got: ${tw.out.slice(0, 300)} ${tw.err.slice(0, 200)}`);

// Outside a Trigger.dev project the same hooks stay silent.
const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "tdp-replay-none-"));
fs.writeFileSync(path.join(elsewhere, "main.go"), "package main\n");
const quiet = await new Promise((resolve) => {
  const p = spawn("sh", [path.join(plugin, "hooks", "session-start.sh")], { cwd: elsewhere, env: { ...env, CLAUDE_PROJECT_DIR: elsewhere }, stdio: ["pipe", "pipe", "ignore"] });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.on("close", () => resolve(out));
  p.stdin.end("");
});
check("silent outside a Trigger.dev project", quiet === "", `got: ${quiet.slice(0, 200)}`);

console.log(`${fail ? "FAILED" : "ok"}: replay of ${1 + rec.guard.length + 1 + 1} recorded hook calls, ${fail} failures`);
process.exitCode = fail ? 1 : 0;
