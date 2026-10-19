#!/usr/bin/env node
// Generates hooks/hooks.json from pattern lists so the handlers cannot drift from the guard's tool tables.
// usage: node scripts/build-hooks.mjs [--check]   (--check exits 1 when hooks.json is out of date)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_GUARDED } from "./lib/guard.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs";
const GATE = 'sh "${CLAUDE_PLUGIN_ROOT}/hooks/marker-gate.sh"';
const base = { timeout: 5, onFailure: "continue" };
const node = (iff, ...args) => ({ type: "command", ...(iff ? { if: iff } : {}), command: "node", args: [ENGINE, ...args], ...base });
const gate = (iff, args) => ({ type: "command", if: iff, command: `${GATE} ${args}`, ...base });

const cliRules = ["Bash(*trigger.dev*)", "Bash(*trigger deploy*)", "Bash(*trigger promote*)", "Bash(*trigger env *)", "Bash(*trigger runs *)"];
const aliasRules = ["npm run *", "pnpm *", "yarn *", "bun *"];

const hooks = {
  hooks: {
    SessionStart: [{ hooks: [{ type: "command", command: 'sh "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"', timeout: 5, onFailure: "continue" }] }],
    PostToolUse: [{ matcher: "^(Edit|Write|MultiEdit)$", hooks: [{ type: "command", command: `${GATE} lint --hook`, timeout: 10, onFailure: "continue" }] }],
    PreToolUse: [
      {
        matcher: "^(Bash|PowerShell)$",
        hooks: [
          ...cliRules.map((r) => node(r, "guard")),
          node("PowerShell(*trigger*)", "guard"),
          ...aliasRules.map((r) => gate(`Bash(${r})`, "guard --alias")),
          ...aliasRules.map((r) => node(`PowerShell(${r})`, "guard", "--alias")),
        ],
      },
      { matcher: `^mcp__(plugin_trigger-dev_)?trigger__(${MCP_GUARDED.join("|")})$`, hooks: [node(null, "guard")] },
    ],
  },
};

const out = `${JSON.stringify(hooks, null, 2)}\n`;
const file = path.join(root, "hooks", "hooks.json");
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (cur !== out) {
    console.error("hooks/hooks.json is out of date; run: node scripts/build-hooks.mjs");
    process.exit(1);
  }
  console.log("hooks.json up to date");
} else {
  fs.writeFileSync(file, out);
  console.log(`hooks.json written (${hooks.hooks.PreToolUse[0].hooks.length} Bash/PowerShell handlers, ${MCP_GUARDED.length} MCP tools)`);
}
