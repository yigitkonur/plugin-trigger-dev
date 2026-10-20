// Prod guard cases. Expectations were recorded from live runs (see docs/spikes.md) and from the decision table in the design.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guard } from "../scripts/lib/guard.mjs";

const cwd = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "min");
process.env.CLAUDE_PROJECT_DIR = cwd;
const bash = (command, mode = "default") => ({ tool_name: "Bash", cwd, permission_mode: mode, tool_input: { command } });
const mcp = (name, input = {}, mode = "default") => ({ tool_name: `mcp__trigger__${name}`, cwd, permission_mode: mode, tool_input: input });

// [name, payload, expected decision or null, opts]
const cases = [
  ["deploy without --env asks", bash("npx trigger.dev@latest deploy"), "ask"],
  ["deploy --env staging passes", bash("npx trigger.dev@latest deploy --env staging"), null],
  ["deploy -e prod passes (explicit)", bash("pnpm exec trigger deploy -e prod"), null],
  ["deploy --env=prod passes", bash("trigger deploy --env=prod"), null],
  ["compound command asks", bash("cd apps/x && ./node_modules/.bin/trigger deploy"), "ask"],
  ["implicit prod denied in bypassPermissions", bash("trigger deploy", "bypassPermissions"), "deny"],
  ["implicit prod denied in dontAsk", bash("trigger deploy", "dontAsk"), "deny"],
  ["--dry-run passes", bash("trigger deploy --dry-run"), null],
  ["--env-file is not --env", bash("trigger deploy --env-file .env.prod"), "ask"],
  ["env pull asks", bash("npx trigger.dev env pull"), "ask"],
  ["env list (names only) passes", bash("npx trigger.dev env list"), null],
  ["env list --show-values asks", bash("npx trigger.dev env list --show-values"), "ask"],
  ["runs cancel asks", bash("trigger runs cancel run_123 -y"), "ask"],
  ["runs list passes", bash("trigger runs list"), null],
  ["dev passes", bash("npx trigger.dev@latest dev"), null],
  ["package script alias asks", bash("npm run deploy:trigger"), "ask"],
  ["pnpm alias asks", bash("pnpm deploy:trigger"), "ask"],
  ["pnpm -w (boolean) before an alias asks", bash("pnpm -w deploy:trigger"), "ask"],
  ["pnpm --filter <pkg> alias asks", bash("pnpm --filter web deploy:trigger"), "ask"],
  ["npm -w <workspace> run alias asks", bash("npm -w web run deploy:trigger"), "ask"],
  ["alias with --env passes", bash("npm run deploy:trigger -- --env staging"), null],
  ["script that already has --env passes", bash("npm run deploy:staging"), null],
  ["unrelated script passes", bash("npm run build"), null],
  ["echo of the words passes", bash("echo trigger deploy"), null],
  ["commit message passes", bash('git commit -m "trigger deploy fix"'), null],
  ["curl of the docs passes", bash("curl https://trigger.dev/docs"), null],
  ["MCP trigger_task prod asks", mcp("trigger_task", { environment: "prod", taskId: "x", payload: {} }), "ask"],
  ["MCP trigger_task default (dev) passes", mcp("trigger_task", { taskId: "x", payload: {} }), null],
  ["MCP trigger_task dev passes", mcp("trigger_task", { environment: "dev" }), null],
  ["MCP deploy with no environment asks (default is prod)", mcp("deploy", {}), "ask"],
  ["MCP deploy with no environment denied in bypass", mcp("deploy", {}, "bypassPermissions"), "deny"],
  ["MCP deploy staging passes", mcp("deploy", { environment: "staging" }), null],
  ["MCP submit_feedback asks", mcp("submit_feedback", { message: "x" }), "ask"],
  ["MCP submit_feedback in bypass: no opinion", mcp("submit_feedback", { message: "x" }, "bypassPermissions"), null],
  ["plugin-prefixed MCP prod cancel asks", { tool_name: "mcp__plugin_trigger-dev_trigger__cancel_run", permission_mode: "default", tool_input: { environment: "prod" } }, "ask"],
  ["MCP read tool passes", mcp("get_run_details", { environment: "prod" }), null],
];

let fail = 0;
for (const [name, payload, expect] of cases) {
  const r = guard(payload, { alias: false });
  const got = r ? r.hookSpecificOutput.permissionDecision : null;
  if (got !== expect) {
    console.log(`FAIL ${name}: expected ${expect}, got ${got}`);
    fail++;
  } else if (r && !/https:\/\/trigger\.dev\/docs\//.test(r.hookSpecificOutput.permissionDecisionReason)) {
    console.log(`FAIL ${name}: reason lacks a doc URL`);
    fail++;
  }
}
console.log(`${fail ? "FAILED" : "ok"}: ${cases.length} guard cases, ${fail} failures`);
process.exitCode = fail ? 1 : 0;

// Regression: a hook whose stdin writer is slower than the reader (EAGAIN on the pipe) must still get a decision.
import { spawn } from "node:child_process";
const engine = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "trigger-ctx.mjs");
const slow = await new Promise((resolve) => {
  const p = spawn("node", [engine, "guard"], { env: { ...process.env, CLAUDE_PROJECT_DIR: cwd }, stdio: ["pipe", "pipe", "ignore"] });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.on("close", () => resolve(out));
  setTimeout(() => p.stdin.end(JSON.stringify(bash("npx trigger.dev@latest deploy"))), 400);
});
if (!/"permissionDecision":"ask"/.test(slow)) {
  console.log("FAIL slow stdin writer: no decision");
  process.exitCode = 1;
} else {
  console.log("ok: slow stdin writer still gets a decision");
}
