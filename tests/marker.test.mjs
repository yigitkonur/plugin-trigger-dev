// The marker file is what keeps the edit tripwire (H2) and the package.json-script guard (H3 alias) free in repos without Trigger.dev.
// These cases check it is found when it should be: in a project path with non-ASCII characters (sh and Node must build the same key),
// and in the very session that creates the project (nothing wrote a marker at SessionStart because there was no signal yet).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.join(here, "..");
const rec = JSON.parse(fs.readFileSync(path.join(here, "recordings", "live-2026-10-20.json"), "utf8"));
const same = (got, want) => { try { return JSON.stringify(JSON.parse(got)) === JSON.stringify(JSON.parse(want)); } catch { return false; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdp-marker-"));
const UTF8 = { LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" };

let fail = 0;
let n = 0;
const check = (name, ok, detail = "") => {
  n++;
  if (!ok) {
    fail++;
    console.log(`FAIL ${name} ${detail}`);
  }
};

function project(name, files) {
  const root = path.join(tmp, name);
  fs.mkdirSync(root, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  const data = fs.mkdtempSync(path.join(tmp, "data-"));
  return { root, data };
}
const put = (p, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(p.root, rel)), { recursive: true });
  fs.writeFileSync(path.join(p.root, rel), text);
};
function run(p, cmd, args, input, extraEnv = {}) {
  const env = { ...process.env, ...UTF8, CLAUDE_PROJECT_DIR: p.root, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: p.data, ...extraEnv };
  delete env.CLAUDE_PLUGIN_OPTION_STEERING;
  delete env.TRIGGER_API_URL;
  const t0 = process.hrtime.bigint();
  const r = spawnSync(cmd, args, { cwd: p.root, env, input: input ?? "", encoding: "utf8", timeout: 15000 });
  return { out: r.stdout || "", err: r.stderr || "", ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}
const gate = (p, args, payload) => run(p, "sh", [path.join(plugin, "hooks", "marker-gate.sh"), ...args], JSON.stringify(payload));
const sessionStart = (p) => run(p, "sh", [path.join(plugin, "hooks", "session-start.sh")], JSON.stringify({ session_id: "m", cwd: p.root, hook_event_name: "SessionStart" }));
const writePayload = (p) => ({ session_id: "m", cwd: p.root, hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: path.join(p.root, rec.tripwire.file), content: rec.tripwire.content }, tool_response: { type: "create", filePath: path.join(p.root, rec.tripwire.file) } });
const bashPayload = (p, command) => ({ session_id: "m", cwd: p.root, permission_mode: "default", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
const markers = (p) => {
  try {
    return fs.readdirSync(path.join(p.data, "projects"));
  } catch {
    return [];
  }
};

const trigger = { "package.json": JSON.stringify({ name: "app", private: true, scripts: { "deploy:trigger": "trigger deploy" }, dependencies: { "@trigger.dev/sdk": "4.7.4" } }), "trigger.config.ts": 'import { defineConfig } from "@trigger.dev/sdk";\nexport default defineConfig({ project: "proj_fixturefixture", dirs: ["./src/trigger"], maxDuration: 300 });\n', "node_modules/@trigger.dev/sdk/package.json": JSON.stringify({ name: "@trigger.dev/sdk", version: "4.7.4" }) };

// 1. A project path with non-ASCII characters (a Turkish "Masaüstü" desktop folder) under a UTF-8 locale.
{
  const p = project(path.join("Masaüstü", "app"), trigger);
  const ss = sessionStart(p);
  check("non-ASCII path: SessionStart prints the facts", ss.out.includes("Trigger.dev project facts"), ss.out.slice(0, 200) + ss.err.slice(0, 200));
  put(p, rec.tripwire.file, rec.tripwire.content);
  const tw = gate(p, ["lint", "--hook"], writePayload(p));
  check("non-ASCII path: the marker written by SessionStart is found by the gate", same(tw.out, rec.tripwire.output), `markers=${JSON.stringify(markers(p))} out=${tw.out.slice(0, 200)} ${tw.err.slice(0, 200)}`);
  const al = gate(p, ["guard", "--alias"], bashPayload(p, "npm run deploy:trigger"));
  check("non-ASCII path: the script-alias guard finds the marker", al.out.includes('"permissionDecision":"ask"'), `out=${al.out.slice(0, 200)}`);
}

// 2. The session that creates the project: it started with no Trigger.dev signal, so SessionStart wrote no marker.
{
  const p = project("fresh", { "package.json": JSON.stringify({ name: "app", private: true, scripts: { build: "tsc" } }) });
  const ss = sessionStart(p);
  check("fresh project: SessionStart is silent and writes no marker", ss.out === "" && markers(p).length === 0, `out=${ss.out.slice(0, 100)} markers=${JSON.stringify(markers(p))}`);
  for (const [rel, text] of Object.entries(trigger)) put(p, rel, text); // what /trigger-dev:init does next
  put(p, rec.tripwire.file, rec.tripwire.content);
  const tw = gate(p, ["lint", "--hook"], writePayload(p));
  check("fresh project: the first task written in the creating session is checked", same(tw.out, rec.tripwire.output), `markers=${JSON.stringify(markers(p))} out=${tw.out.slice(0, 200)} ${tw.err.slice(0, 200)}`);
  check("fresh project: the gate left a marker so later edits stay cheap", markers(p).length === 1, JSON.stringify(markers(p)));
}
{
  const p = project("fresh-alias", { "package.json": JSON.stringify({ name: "app", private: true }) });
  sessionStart(p);
  for (const [rel, text] of Object.entries(trigger)) put(p, rel, text);
  const al = gate(p, ["guard", "--alias"], bashPayload(p, "npm run deploy:trigger"));
  check("fresh project: npm run deploy:trigger asks in the creating session", al.out.includes('"permissionDecision":"ask"'), `out=${al.out.slice(0, 200)} ${al.err.slice(0, 200)}`);
}
{
  // The PowerShell handlers call the engine directly (no sh gate), so the engine arms itself too.
  const p = project("fresh-ps", { "package.json": JSON.stringify({ name: "app", private: true }) });
  for (const [rel, text] of Object.entries(trigger)) put(p, rel, text);
  const al = run(p, "node", [path.join(plugin, "scripts", "trigger-ctx.mjs"), "guard", "--alias"], JSON.stringify(bashPayload(p, "npm run deploy:trigger")));
  check("fresh project: the engine's alias guard (PowerShell path) arms itself", al.out.includes('"permissionDecision":"ask"'), `out=${al.out.slice(0, 200)} ${al.err.slice(0, 200)}`);
}

// 3. Repos without Trigger.dev stay silent, leave no marker, and stay cheap.
{
  const p = project("go-app", { "go.mod": "module example.com/app\n", "main.go": "package main\n" });
  const payload = { session_id: "m", cwd: p.root, hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: path.join(p.root, "main.go"), content: "package main\n" }, tool_response: { type: "create", filePath: path.join(p.root, "main.go") } };
  const times = [];
  let out = "";
  for (let i = 0; i < 10; i++) {
    const r = gate(p, ["lint", "--hook"], payload);
    out += r.out;
    times.push(r.ms);
  }
  const al = gate(p, ["guard", "--alias"], bashPayload(p, "npm run deploy:trigger"));
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  check("non-Trigger repo: silent, no marker", out === "" && al.out === "" && markers(p).length === 0, `out=${out.slice(0, 100)} markers=${JSON.stringify(markers(p))}`);
  check("non-Trigger repo: the gate stays shell-only (fastest of 10 under 60 ms; a Node start alone is 35+ ms on top of sh)", min < 60, `min=${min.toFixed(1)} ms`);
  console.log(`info: non-Trigger repo gate min ${min.toFixed(1)} ms, mean ${mean.toFixed(1)} ms over ${times.length} runs`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${fail ? "FAILED" : "ok"}: ${n} marker checks, ${fail} failures`);
process.exitCode = fail ? 1 : 0;
