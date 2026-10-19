# 05 — Steering and hooks

This file decides **what the agent sees, when, and at what cost**. Every injection point names the failure it prevents. Three hooks are kept, one more is conditional (phase 3), and fourteen hook ideas are rejected with reasons.

## 1. Steering layers

| Layer | Mechanism | When | Size | Failure prevented |
|---|---|---|---|---|
| Ambient | Skill listing (3 descriptions) | always, while the plugin is enabled | ≈ 450 tokens | The agent doesn't know Trigger.dev guidance exists |
| Ambient | Deferred MCP tool names (Tool Search) | always, while the plugin is enabled | ≈ 250 tokens; 0 if deduped against the user's own server | — (cost of including the official server) |
| Ambient | **H1 fingerprint** | session start/resume/clear/compact, Trigger.dev projects only | ≤ 700 chars ≈ 200 tokens | Guessing versions/layout/package manager/target; v3 code in v4 projects; parallel `trigger dev` sessions stealing runs |
| Situational | `build` / `chat-agent` / `diagnose` body | on intent match or command | ≤ 1,200 words | Wrong primitive; no discovery; no evidence |
| Situational | one scenario card / playbook | after classification | ≤ 500 words | Loading everything for one question |
| Evidence | `trigger-ctx docs` → one page | per recommendation | 1 page | Stale API memory; copying docs into the plugin |
| Reactive | **H2 edit tripwire** | after Edit/Write in a marked project | 0 if clean; ≤ 1,500 chars on hit | Silent-failure / stale-API code lands unnoticed |
| Reactive | **H3 prod guard** | trigger CLI commands, script aliases, MCP writes | 0 unless it asks or denies | Implicit prod deploy/env/cancel; prod secrets pulled into `.env.local`; live prompt overrides |
| Reactive | H4 CLI failure signatures (phase 3) | failed trigger CLI command | ≤ 600 chars | Flailing on known errors; bypassing version checks |

**Standing budget:**

| Where | Cost |
|---|---|
| Trigger.dev project | ≈ 900 tokens (listing + MCP names + fingerprint) |
| Other repo, plugin enabled at **project** scope | 0 (not loaded) |
| Other repo, plugin enabled at **user** scope | ≈ 450–700 tokens, no hook output, one sh spawn at session start, one `stat` per edit |

→ README and `doctor` recommend **project-scope** enablement for teams. User scope is for people who mostly work in Trigger.dev projects.

### Rules for injected text
- Facts, not imperatives. Hook output arrives as a system reminder, and imperative text from a hook is a prompt-injection pattern ([hooks](https://code.claude.com/docs/en/hooks)). Write "`streamText` imported from `ai` bypasses chat.agent's stream", not "You MUST…".
- Each fact carries its doc URL.
- No secrets ever: env files are read for variable *names* only.
- Prefix: "Trigger.dev …(plugin trigger-dev)" so the user and the model know the source.
- Hard caps: H1 700 chars, H2 5 hits / 1,500 chars, H4 600 chars. The platform cap is 10,000 chars ([hooks](https://code.claude.com/docs/en/hooks)).

## 2. `hooks/hooks.json`

Every handler sets `"onFailure": "continue"` (Claude Code ≥ 2.1.295). On Windows without Git Bash, shell-form hooks run in PowerShell and fail. A failing shell-form PreToolUse hook with `onFailure` unset can block the tool call there ([hooks](https://code.claude.com/docs/en/hooks)), so the guard handlers that must work everywhere use exec-form `node`.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [
        { "type": "command", "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh\"",
          "timeout": 5, "onFailure": "continue" }
      ] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [
        { "type": "command", "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/marker-gate.sh\" lint --hook",
          "timeout": 10, "onFailure": "continue" }
      ] }
    ],
    "PreToolUse": [
      { "matcher": "Bash|PowerShell", "hooks": [
        { "type": "command", "if": "Bash(*trigger.dev*)",
          "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs", "guard"],
          "timeout": 5, "onFailure": "continue" },
        { "type": "command", "if": "Bash(*trigger deploy*)",
          "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs", "guard"],
          "timeout": 5, "onFailure": "continue" },
        { "type": "command", "if": "Bash(*trigger promote*)",
          "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs", "guard"],
          "timeout": 5, "onFailure": "continue" },
        { "type": "command", "if": "Bash(*trigger env *)",
          "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs", "guard"],
          "timeout": 5, "onFailure": "continue" },
        { "type": "command", "if": "Bash(*trigger runs *)",
          "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs", "guard"],
          "timeout": 5, "onFailure": "continue" },
        { "type": "command", "if": "PowerShell(*trigger*)",
          "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs", "guard"],
          "timeout": 5, "onFailure": "continue" },
        { "type": "command", "if": "Bash(npm run *)",
          "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/marker-gate.sh\" guard --alias",
          "timeout": 5, "onFailure": "continue" }
      ] },
      { "matcher": "^mcp__(plugin_trigger-dev_)?trigger__(deploy|trigger_task|cancel_run|replay_run|promote_prompt_version|(create|update|remove|reactivate)_prompt_override|start_agent_chat|send_agent_message|write_session_channel|generate_webhook_secret|set_webhook_secret|replay_webhook_delivery|create_project_in_org)$",
        "hooks": [
        { "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs", "guard"],
          "timeout": 5, "onFailure": "continue" }
      ] }
    ]
  }
}
```

Not shown, but identical to the `npm run *` handler: `pnpm *`, `yarn *` and `bun run *`. The `if` field holds exactly one permission rule, so each pattern is its own handler ([hooks](https://code.claude.com/docs/en/hooks)). `hooks.json` is generated from a pattern list by the plugin build so the handlers can't drift. The MCP matcher contains regex characters, so it is an unanchored JavaScript regex; `^…$` anchors it. It names both the user-server and plugin-server prefixes ([07 §1](07-mcp-vs-cli.md)). H4 (phase 3) mirrors the Bash `if` set on `PostToolUseFailure`.

`steering` handling: every script reads `CLAUDE_PLUGIN_OPTION_STEERING` first.

| Value | H1 | H2 | H3 | H4 |
|---|---|---|---|---|
| `full` (default) | ✓ | ✓ | ✓ | ✓ (phase 3) |
| `quiet` | — | — | ✓ | — |
| `off` | — | — | — | — |

## 3. Kept hooks: the six answers

### H1 — SessionStart: project fingerprint

| Question | Answer |
|---|---|
| **Event** | `SessionStart`, no matcher (startup, resume, clear, compact). Shell form `sh session-start.sh`, timeout 5 s. |
| **Trigger condition** | Pure sh, no JSON parsing, ordered cheapest first:<br>1. `trigger.config.{ts,mts,cts,js,mjs}` at the project root<br>2. `git ls-files '*trigger.config.*'` (monorepos)<br>3. bounded `find -maxdepth 4` skipping `node_modules`/`.git` if not a git repo<br>4. `@trigger.dev/` in a root/workspace `package.json`<br>5. `trigger/package.json` (polyglot)<br>6. the *names* `TRIGGER_SECRET_KEY`/`TRIGGER_API_URL` in `.env*`<br>None → exit 0 with no output. |
| **What it injects** | ≤ 700 chars of facts in priority order (truncated from the bottom):<br>1. trigger root(s) + project ref + dirs (monorepo: ≤ 3 roots + "N more")<br>2. SDK/CLI/build versions + mismatch + v3-EOL flag<br>3. package manager + workspace tool<br>4. frontend framework<br>5. `ai` major<br>6. features in use<br>7. target (Cloud vs self-host URL)<br>8. pinned-docs path<br>9. overlaps (official skills installed, user MCP server)<br>10. worktree line<br>Node runs `trigger-ctx detect --brief` only if a config exists **and** `command -v node` succeeds; otherwise the sh-only subset is printed. |
| **Side effects** | • Writes the marker `${CLAUDE_PLUGIN_DATA}/projects/<sha1(root)>`; prunes markers and dedupe files older than 7 days.<br>• In a linked git worktree with `steering=full`, appends `export TRIGGER_DEV_BRANCH=<worktree-name>` to `CLAUDE_ENV_FILE` and says so in the fingerprint ([deployment/dev-branches](https://trigger.dev/docs/deployment/dev-branches)). |
| **Failure prevented** | N2: the agent guesses versions, roots and package manager, writes v3 code in v4 projects, or deploys from the wrong root. Also the documented trap that a second plain `trigger dev` (a parallel session) splits runs between workers ([troubleshooting](https://trigger.dev/docs/troubleshooting#runs-never-dequeue-in-dev)). |
| **Cost** | Non-Trigger repo: one sh spawn, ≈ 10–30 ms, no output. Trigger repo: ≤ 300 ms with Node, ≈ 200 tokens. SessionStart blocks the first response, which is why the sh path is tiny and Node is conditional. |
| **Why not a skill or command** | Skills load only after the model decides they're relevant, and they don't know the repo. A command needs the user to remember it. CLAUDE.md is static, user-owned and goes stale (init offers an opt-in 5-line pointer only). The facts must exist before the first answer, which only SessionStart guarantees. |

Sample output:
```
Trigger.dev project facts (plugin trigger-dev):
- root apps/jobs: trigger.config.ts, project proj_abc123, dirs ./src/trigger (1 more root: packages/ai)
- @trigger.dev/sdk 4.7.4 · trigger.dev CLI 4.7.4 · @trigger.dev/build 4.7.4 (aligned)
- pnpm workspaces + turbo · frontend next 16 (app router) · ai 6.x
- in use: schedules, realtime hooks, chat.agent
- target: Trigger.dev Cloud (default CLI profile)
- pinned docs: apps/jobs/node_modules/@trigger.dev/sdk/docs/
- MCP calls for this root: configPath=apps/jobs/trigger.config.ts projectRef=proj_abc123
- official trigger-* skills also installed in .claude/skills (see /trigger-dev:doctor)
```

### H2 — PostToolUse `Edit|Write`: tripwire lint

| Question | Answer |
|---|---|
| **Event** | `PostToolUse`, matcher `Edit\|Write`. Shell form `sh marker-gate.sh lint --hook`, timeout 10 s. |
| **Trigger condition** | 1. Marker absent → exit 0 without reading stdin (one `test -f`).<br>2. Present → Node parses stdin and filters by extension: TS/JS for code rules; any text file except `.env*` for RT-01 (so Python/Go/Ruby REST call sites are covered).<br>3. Token prefilter on the written file: `@trigger.dev/`, `triggerAndWait`, `tr_(dev\|stg\|prod\|preview\|pat)_`, `TRIGGER_SECRET_KEY\|TRIGGER_ACCESS_TOKEN`.<br>4. Runs only `tier: hook` rules whose `applies_when` matches the installed SDK. |
| **What it injects** | `hookSpecificOutput.additionalContext` with ≤ 5 hits as `file:line — fact → fix (doc URL)`. Never blocks. Dedupe: one atomic touch-file per file + rule, so the same hit isn't repeated on every edit. |
| **Rules (14)** | MIG-01, MIG-02, MIG-04, MIG-05, MIG-06, MIG-07, TSK-01, SCH-01, SCH-02, RT-01, RT-02, CHT-01, CHT-04, CHT-11 ([06 §4.3](06-flows-init-consult-audit.md)). Admission bar: ≥ 95% precision on a corpus of public Trigger.dev repos; MIG rules gated `sdk>=4`. |
| **Failure prevented** | N1/N5: code that compiles but silently misbehaves lands because the model didn't apply (or no longer has) the skill text. Examples: `streamText` imported from `ai` inside `chat.agent`; `Promise.all` around `triggerAndWait`; scope-less public tokens; a secret key literal in a Python file. |
| **Cost** | Non-Trigger repo: one `stat` per edit (≈ 3 ms). Trigger repo: ≈ 60–150 ms Node per edit; 0 tokens when clean. |
| **Why not a skill or command** | Skills are advisory and fade after compaction (only the first 5,000 tokens are re-attached). Hooks give "deterministic control: certain actions always happen rather than relying on the LLM to choose to run them" ([hooks guide](https://code.claude.com/docs/en/hooks-guide)). A skill-scoped hook would only exist after the skill loads. PostToolUse (not Pre) because Edit payloads are fragments; the written file is the truth. |

Sample output:
```
Trigger.dev tripwire (plugin trigger-dev), 2 hits:
- src/trigger/agent.ts:3 — streamText is imported from "ai"; inside chat.agent it must come from the run argument or carry ...chat.toStreamTextOptions(), otherwise the turn bypasses the managed stream → destructure streamText from run() (https://trigger.dev/docs/ai-chat/backend#the-managed-streamtext)
- src/trigger/import.ts:42 — Promise.all wraps childTask.triggerAndWait; waits can't run in parallel in a task → childTask.batchTriggerAndWait([...]) (https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported)
```

### H3 — PreToolUse: prod guard

| Question | Answer |
|---|---|
| **Event** | `PreToolUse`. (a) `Bash\|PowerShell` with `if` rules `*trigger.dev*`, `*trigger deploy*`, `*trigger promote*`, `*trigger env *`, `*trigger runs *` (PowerShell: `*trigger*`) → exec-form `node trigger-ctx.mjs guard`. (b) `Bash` with `if` rules `npm run *`, `pnpm *`, `yarn *`, `bun run *` → `marker-gate.sh guard --alias`, which resolves the package.json script body. (c) MCP write tools (regex above) → exec-form node. |
| **Trigger condition** | Decision table (tokenised exactly):<br>• **CLI** subcommand ∈ {deploy, promote, env set, env pull, env get, env list --show-values, runs cancel, runs replay} and no `--env`/`--env=`/`-e` (`--env-file` doesn't count) → `ask`.<br>• Same, but `permission_mode` is `bypassPermissions` or `dontAsk` → `deny` with the same reason. `ask` there is undocumented; an explicit `--env prod` passes.<br>• **MCP** write tools: effective env = `tool_input.environment` ?? tool default (dev; `deploy` has none). `ask` when prod.<br>• `generate_webhook_secret`, `set_webhook_secret`, `create_project_in_org` → always `ask`.<br>• Explicit and allowed → no output.<br>• `deploy --skip-update-check` → `additionalContext`: "the docs advise against bypassing version checks". |
| **What it blocks/asks** | A permission prompt labelled `[plugin:trigger-dev]` with the reason. Example: "`trigger deploy` defaults to prod; add `--env staging` or `--env prod` (https://trigger.dev/docs/cli-deploy-commands)". A hook `ask` forces a prompt even in auto mode ([hooks](https://code.claude.com/docs/en/hooks)). In `-p` runs with no permission host the call is denied and Claude sees the reason. |
| **Failure prevented** | N6:<br>• "deploy this" → production<br>• `env pull` writes **prod secrets** into `.env.local`<br>• `runs cancel` kills a live run<br>• a prompt override changes live LLM behaviour without a deploy<br>• `npm run deploy:trigger` hides `trigger deploy` (implicit prod) |
| **Cost** | Node spawns only on trigger commands and MCP writes (plus best-effort `if` cases with `$()`, where the script exits silently). The alias path is one `stat` in non-Trigger repos. 0 tokens unless it acts. |
| **Why not permissions, a skill or a command** | Permission rules match what *is* in a command, not a missing flag or a tool's default env. A skill is advisory, and in auto mode nothing would stop the call. A command requires the user to route deploys through it. `deny` rules would also block legitimate explicit deploys. |

### H4 — PostToolUseFailure: CLI failure signatures (phase 3, conditional)

| Question | Answer |
|---|---|
| **Event** | `PostToolUseFailure`, `Bash\|PowerShell`, same `if` set as H3(a); exec-form node. |
| **Trigger condition** | The failed command's output matches one of ≤ 15 signatures. |
| **What it injects** | ≤ 600 chars: cause + fix + doc. Signatures:<br>• version mismatch → `trigger update`<br>• `resource_exhausted` → `--native-build`<br>• `No loader is configured for ".node"` → `build.external`<br>• not logged in → resumable login<br>• `TRIGGER_ACCESS_TOKEN` missing in CI<br>• Zod major mismatch<br>• `[PrismaExtension]` errors<br>• `Parallel waits are not supported`<br>• `COULD_NOT_FIND_EXECUTOR` |
| **Failure prevented** | N1/N10: retry loops, and "fixing" a version check with `--skip-update-check`. |
| **Cost** | Only on failed trigger commands. |
| **Why not a skill** | The error text arrives mid-loop. `diagnose` might not load for a CLI failure, and the hook attaches the exact doc to the failing call. **Ships only if evals show flailing without it.** |

## 4. What happens outside Trigger.dev projects (N14)

| Hook | Work done in a non-Trigger repo | Output |
|---|---|---|
| H1 | one sh spawn: ≤ 6 file tests, one `git ls-files`, no Node | none |
| H2 | one sh spawn + one `test -f` per Edit/Write | none |
| H3(a) | spawns only when a command contains `trigger.dev` / `trigger deploy` / … (e.g. `curl https://trigger.dev/...`); node exits silently | none |
| H3(b) | one `test -f` on `npm run`/`pnpm`/`yarn`/`bun run` | none |
| H3(c) | never (no Trigger MCP calls) | none |

## 5. Rejected hooks

| Idea | Event | Why rejected |
|---|---|---|
| Keyword router ("you mentioned cron → load build") | UserPromptSubmit | A spawn on every prompt in every repo. Skill descriptions + negative evals do the routing for free. Imperative injections are a known anti-pattern. |
| Prompt rewriting | UserPromptExpansion | Same cost; it alters user intent. |
| "Did you run it?" verifier | Stop | False positives on every non-Trigger turn; verification belongs in `init`/`new` stage 5 where it's explicit. |
| Re-fingerprint on config change | FileChanged `trigger.config.*` | Rare; `detect` runs on demand and H1 re-runs on resume/clear/compact. |
| Re-fingerprint on directory change | CwdChanged | H1 lists all roots up front. |
| Batch lint | PostToolBatch | H2 per edit is already cheap. Batching delays feedback past the point the model can fix in the same turn. |
| Save/restore context | PreCompact / PostCompact | SessionStart fires with `compact`; H1 re-injects the fingerprint and skills re-attach automatically. |
| React to CLAUDE.md loading | InstructionsLoaded | Nothing to add. |
| Push context into subagents | SubagentStart | Plugin agents name what they need (`tools`, `skills`); the main fingerprint is enough. |
| MCP-backed checks | `mcp_tool` hooks | Need auth and network; latency per call; MCP isn't reliably available at SessionStart. |
| Semantic lint by LLM | `prompt` / `agent` hooks | An LLM call per edit: cost and latency far beyond the value. `audit` does judgment on demand. |
| Tail `trigger dev` output | monitors | No `userConfig`; run outside the sandbox; interactive only; `dev_server_status` covers it. |
| Hooks inside skills | skill `hooks:` frontmatter | They exist only after the skill loads; H2/H3 must hold regardless. |
| One-time setup | Setup | Nothing to install: the engine is zero-dependency. |

## 6. Measurement plan (Phase 0)

- **Latency:** H1 and H2 on (a) an empty Go repo, (b) a 2,000-package pnpm monorepo, (c) a Trigger.dev Next.js app.
  - Targets: ≤ 30 ms (a); ≤ 300 ms H1 / ≤ 150 ms H2 (b, c).
  - Log via `CLAUDE_PLUGIN_DATA/timings.log` when `TRIGGER_CTX_DEBUG=1`.
- **Precision:** run hook-tier rules over ≥ 20 public Trigger.dev repos.
  - Any rule under 95% precision drops to audit tier.
- **Spikes:**
  - `ask` under bypassPermissions
  - `if` behaviour for leading-`*` Bash patterns on compound commands
  - Windows without Git Bash, with `onFailure: continue`

## Sources
https://code.claude.com/docs/en/hooks · https://code.claude.com/docs/en/hooks-guide · https://code.claude.com/docs/en/permissions · https://code.claude.com/docs/en/skills · https://code.claude.com/docs/en/plugins-reference · https://trigger.dev/docs/cli-deploy-commands · https://trigger.dev/docs/cli-env-commands · https://trigger.dev/docs/deployment/dev-branches · https://trigger.dev/docs/troubleshooting
