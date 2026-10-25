#!/usr/bin/env node
// Generates hooks/hooks.json (Claude Code) and hooks/codex-hooks.json (Codex) from pattern lists so the handlers cannot drift from the guard's tool tables.
// usage: node scripts/build-hooks.mjs [--check]   (--check exits 1 when either file is out of date)
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

// Codex: no `if` filters (hooks/codex-guard.sh prefilters in sh), file writes arrive as apply_patch, the path variable is PLUGIN_ROOT.
const CX = 'sh "${PLUGIN_ROOT}/hooks/';
const cx = { timeout: 10 };
const codex = {
  hooks: {
    SessionStart: [{ hooks: [{ type: "command", command: `${CX}session-start.sh" codex`, ...cx }] }],
    PostToolUse: [{ matcher: "^(apply_patch|Edit|Write)$", hooks: [{ type: "command", command: `${CX}marker-gate.sh" lint --hook`, ...cx }] }],
    PreToolUse: [
      { matcher: "^Bash$", hooks: [{ type: "command", command: `${CX}codex-guard.sh"`, ...cx }] },
      { matcher: `^mcp__trigger__(${MCP_GUARDED.join("|")})$`, hooks: [{ type: "command", command: 'node "${PLUGIN_ROOT}/scripts/trigger-ctx.mjs" guard', ...cx }] },
    ],
  },
};

const targets = [
  [path.join(root, "hooks", "hooks.json"), `${JSON.stringify(hooks, null, 2)}\n`],
  [path.join(root, "hooks", "codex-hooks.json"), `${JSON.stringify(codex, null, 2)}\n`],
];
if (process.argv.includes("--check")) {
  const stale = targets.filter(([f, out]) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "") !== out);
  if (stale.length) {
    console.error(`${stale.map(([f]) => path.relative(root, f)).join(", ")} out of date; run: node scripts/build-hooks.mjs`);
    process.exit(1);
  }
  console.log("hooks.json and codex-hooks.json up to date");
} else {
  for (const [f, out] of targets) fs.writeFileSync(f, out);
  console.log(`hooks.json written (${hooks.hooks.PreToolUse[0].hooks.length} Bash/PowerShell handlers, ${MCP_GUARDED.length} MCP tools); codex-hooks.json written`);
}
