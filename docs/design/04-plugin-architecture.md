# 04 — Plugin architecture

Every component below names the needs it serves (N1–N14, [00 §3](00-overview.md)) and why it uses that primitive and not another. Snippets are illustrative; they are validated against the spec in [10 §6](10-roadmap-and-open-questions.md). Nothing is scaffolded.

## 1. Directory tree

```
trigger-dev/
├── .claude-plugin/
│   └── plugin.json                  manifest + userConfig.steering
├── .mcp.json                        the official Trigger.dev MCP server, unchanged
├── hooks/
│   ├── hooks.json                   H1 SessionStart · H2 PostToolUse · H3 PreToolUse · H4 PostToolUseFailure (phase 3)
│   ├── session-start.sh             POSIX sh: detect → marker + ≤700-char fingerprint; silent elsewhere
│   └── marker-gate.sh               POSIX sh: no marker → exit 0; else exec node trigger-ctx.mjs "$@"
├── bin/
│   └── trigger-ctx                  sh shim: resolves its own dir via $0 → node ../scripts/trigger-ctx.mjs "$@"
├── scripts/
│   ├── trigger-ctx.mjs              zero-dependency Node ≥18 engine; always exits 0
│   └── rules/rules.json             134 rules as data (14 hook tier)
├── skills/
│   ├── build/                       model + user
│   │   ├── SKILL.md                 protocol + 8 invariants (≤1,200 words)
│   │   ├── discovery.md             question bank + skip rules (shared with init/new)
│   │   └── scenarios/               13 cards, ≤500 words each
│   │       background-job · scheduled-pipeline · fan-out-batch · long-workflow-waits ·
│   │       human-in-the-loop-and-callbacks · progress-ui · heavy-compute · webhook-driven ·
│   │       polyglot-caller · ai-pipeline · cost-sensitive · migrate-v2-v3 · deploy-ci
│   ├── chat-agent/                  model + user
│   │   ├── SKILL.md                 invariants + discovery C1–C8 + decision tree
│   │   └── playbooks/               10: greenfield · migrate-route-handler · persistence ·
│   │                                approvals-and-questions · server-and-channel-callers · fast-first-reply ·
│   │                                long-conversations · resilience · sub-agents-tools-sandbox · test-verify-ship
│   ├── diagnose/                    model + user
│   │   ├── SKILL.md                 symptom → first check → evidence → fix
│   │   ├── symptoms.md              ~35 rows
│   │   └── trql.md                  query ideas (exact SQL written after get_query_schema)
│   ├── init/                        user only
│   │   ├── SKILL.md                 stages 0–6
│   │   ├── questions.md             Q1–Q6 with skip rules
│   │   └── templates/               ≤4: polyglot subpackage · manual config · REST call sites · realtime token route
│   ├── new/SKILL.md                 user only: add one capability, end with a proven run
│   ├── audit/SKILL.md               user only: scan → static report → auditors → live → report/fix
│   ├── ship/SKILL.md                user only: preflight → pipeline → deploy → verify (reads build/scenarios/deploy-ci.md)
│   └── doctor/SKILL.md              user only: toolchain, auth, MCP, duplicates, versions, self-host, install scope
├── agents/
│   ├── run-investigator.md          live run/ops evidence → ≤25-line verdict; read-only
│   └── code-auditor.md              one audit domain per instance → findings JSON
├── references/                      read lazily via ${CLAUDE_PLUGIN_ROOT}/references/…
│   ├── link-index.md                scenario/symptom → doc (local path, web path, since, flags)
│   ├── traps.md                     stale knowledge: old → new (single source)
│   ├── limits.md                    decision-relevant numbers with URL and plan dependence
│   ├── mcp-vs-cli.md                matrix + fallbacks (from 07)
│   └── rule-catalog.md              rendered from rules.json
├── evals/                           claude plugin eval suite + mocks/trigger/*.md (phase 3)
├── AGENTS.md                        maintainer rules: version bump, link CI, rule precision bar
└── README.md                        install scope, Windows/Git Bash, min Claude Code version, steering values
```

## 2. Component inventory

| Component | Primitive | Invoked by | Needs | Why this primitive (and not another) | Budget |
|---|---|---|---|---|---|
| `build` | skill, model + user | intent match in a Trigger.dev context, or `/trigger-dev:build <question>` | N1, N3, N4, N8, N9, N10 | Design questions arrive in natural language at any time → model-invocable. User-invocable too, so it doubles as the "ask" command. A hook can't classify intent. | listing ≈ 150 tokens; body ≤ 1,200 words |
| `build/scenarios/*` | skill supporting files | `build` after classification | N3, N11 | One card per situation keeps each answer to ~500 words of context instead of everything. | ≤ 500 words each |
| `chat-agent` | skill, model + user | chat/assistant/agent intent; `@trigger.dev/sdk/ai` in code | N1, N3, N4, N5, N11 | Separate from `build`: chat changes fastest (GA July 2026), has its own discovery tree, and would triple `build`'s size. | listing ≈ 150; body ≤ 1,200 words |
| `diagnose` | skill, model + user | symptoms, run ids, error strings | N7, N13 | Symptoms arrive unannounced ("my cron didn't fire") → must be model-invocable. | listing ≈ 150; body ≤ 900 words |
| `init` | skill, user only | `/trigger-dev:init [goal]` | N2, N3, N4, N9, N12 | Side effects (packages, files, cloud project, login) → the user decides when. `disable-model-invocation` = 0 standing cost. | 0 standing |
| `new` | skill, user only | `/trigger-dev:new <capability>` | N3, N4 | Adding a capability is a procedure that ends in a proven run, not a Q&A. | 0 standing |
| `audit` | skill, user only | `/trigger-dev:audit …` | N5, N13 | Long, explicit, may write a report and commits. | 0 standing |
| `ship` | skill, user only | `/trigger-dev:ship [env]` | N6, N10 | Deploys are deliberate and touch prod. | 0 standing |
| `doctor` | skill, user only | `/trigger-dev:doctor` | N2, N12, N14 | Diagnostics on demand: duplicate official skills/MCP, versions, install scope, Git Bash. | 0 standing |
| `run-investigator` | agent (sonnet) | `diagnose`, `audit --live` | N7, N13 | Traces and TRQL results are large; the answer is small. Isolation keeps the main context clean. | returns ≤ 25 lines |
| `code-auditor` | agent (sonnet) | `audit` (≤ 4 in parallel) | N5, N13 | Judging every located hit means reading many files → parallel and isolated. | returns findings JSON |
| H1 SessionStart | hook | session start/resume/clear/compact | N2, N14 | Must run before the first answer; see [05 §3](05-steering-and-hooks.md). | ≈ 200 tokens in Trigger.dev projects, 0 elsewhere |
| H2 PostToolUse | hook | Edit/Write in a marked project | N1, N5 | Must hold every time, even when no skill is loaded. | 0 unless a hit |
| H3 PreToolUse | hook | trigger CLI, script aliases, MCP writes | N6 | Flag *absence* and env defaults can't be expressed as permission rules. | 0 unless it acts |
| H4 PostToolUseFailure | hook (phase 3) | failed trigger CLI command | N1, N10 | Attach the exact fix to the failing call. Ships only if evals show flailing. | ≤ 600 chars on failure |
| `.mcp.json` | MCP server | startup | N7, N13 | Live account/run data needs the official API surface; the brief requires it. | ≈ 250 tokens of deferred names (0 if deduped) |
| `trigger-ctx` | script + `bin/` shim | hooks, skills, agents, CI | N1, N2, N5, N8, N14 | Deterministic work belongs in code: one engine, rules as data. | — |
| `references/*` | plugin files | skills/agents via Read/Grep | N1, N8, N11, N12 | Shared by several skills; one source per fact. | read on demand |
| `templates/` (≤ 4) | skill supporting files | `init`/`new` | N9 | Only where `init -y` can't scaffold: polyglot, manual config, REST callers, token route. Typechecked in CI. | read on demand |
| `userConfig.steering` | manifest | enable-time prompt, `/config` | N14 | Native kill switch; no settings file or command needed. | — |
| `evals/` | `claude plugin eval` suite | plugin CI | N8, N14 | Proves Δ and guards the negative cases (no activation outside Trigger.dev). | — |

Listing total for the 3 model-invocable skills: descriptions ≈ 1,000 characters ≈ 450 tokens including names, under the 1% listing budget and the 1,536-character per-skill cap ([skills](https://code.claude.com/docs/en/skills)).

### Draft descriptions (the activation contract)

- **build**: "Design and write Trigger.dev code (tasks, schedules, batches, waits and approvals, realtime progress UIs, build extensions, deploys and CI). Use when the project uses Trigger.dev (trigger.config.*, @trigger.dev/* packages) or the user names Trigger.dev. Not for Celery, Sidekiq, BullMQ, plain cron or other job systems in projects without Trigger.dev."
- **chat-agent**: "Build, migrate or debug AI chat agents on Trigger.dev (chat.agent, the chat transport, sessions, transcript storage, tool approvals, server/Slack/Linear callers). Use when a Trigger.dev project needs a chat assistant or agent, or code imports @trigger.dev/sdk/ai or @trigger.dev/sdk/chat."
- **diagnose**: "Find out why Trigger.dev runs or deploys misbehave (stuck QUEUED or PENDING_VERSION, failed, timed out, crashed or OOM, schedules not firing, 429s, CI deploy failures, chat history lost). Use when a Trigger.dev project shows an error, a run id (run_…) or 'my task didn't run'."

Negative eval cases: Celery in a Django repo, Sidekiq, BullMQ in a Node repo without Trigger.dev, GitHub Actions cron. None of these should load `build`.

## 3. Skill internals (what goes first)

After compaction only the first 5,000 tokens of each invoked skill are re-attached ([skills](https://code.claude.com/docs/en/skills)), so every SKILL.md is ordered by importance:

1. **Anchor**: "Use the Trigger.dev fingerprint in context; if absent run `trigger-ctx detect --brief`."
2. **Invariants**: 8 for `build` (below), 8 for `chat-agent`, 4 for `diagnose`.
3. **Protocol**: classify → card → ask/assume → verify via docs → bridge answer.
4. **Card index**: one line per card: "when the user is building X → `scenarios/x.md`".
5. **Doc lookup**: the 3 tiers ([08 §2](08-doc-link-index.md)).

`build` invariants (the most expensive mistakes, all checked by H2 or `audit`):
1. Import from `@trigger.dev/sdk` (+ `/ai`, `/chat`, `/chat/react`, `/chat-server`); `defineConfig` from `@trigger.dev/sdk`; never `/v3` in v4 projects; extension import paths per [config/extensions/overview](https://trigger.dev/docs/config/extensions/overview).
2. `triggerAndWait` / `wait.forToken` return Results: check `.ok` or call `.unwrap()`.
3. Never wrap waits in `Promise.all`; use the batch APIs.
4. App code triggers with a type-only import + `tasks.trigger<typeof t>("id")` (or REST) and awaits every trigger.
5. Idempotency keys come from stable business ids; scope semantics changed in 4.3.1; side effects use the provider's own idempotency key.
6. Waits < 60 s hold the concurrency slot, and waits ≤ 5 s are billed; use tokens for external events.
7. The secret key stays server-side; browsers get scoped public/trigger tokens; no secrets in payloads.
8. Environment is always explicit (CLI defaults to prod, MCP to dev); features are version-gated against the installed SDK.

Scenario card template (≤ 500 words):

```
# <scenario>
You're building: <one line>            Not this card if: <routing>
Primitives: <A> because … · <B> because … (rejected: <C> because …)
Ask only if unknown: <≤2 questions>
Minimal shape: <≤15 lines, verify names via trigger-ctx docs before writing>
Pitfalls → rules: <≤5, each with rule id>
Docs: <rows from link-index>
```

## 4. Agents

**`run-investigator`** (illustrative):
```markdown
---
name: run-investigator
description: Investigates Trigger.dev runs, queues and deployments with live MCP data and returns a short verdict with evidence. Use for a run id, a failing task, stuck queues or "is prod healthy". Read-only.
model: sonnet
maxTurns: 25
tools: Read, Grep, Glob, Bash, mcp__trigger__get_run_details, mcp__trigger__list_runs, mcp__trigger__get_report, mcp__trigger__get_query_schema, mcp__trigger__query, mcp__trigger__get_current_worker, mcp__trigger__list_deploys, mcp__trigger__whoami, mcp__plugin_trigger-dev_trigger__get_run_details, mcp__plugin_trigger-dev_trigger__list_runs, mcp__plugin_trigger-dev_trigger__get_report, mcp__plugin_trigger-dev_trigger__get_query_schema, mcp__plugin_trigger-dev_trigger__query, mcp__plugin_trigger-dev_trigger__get_current_worker, mcp__plugin_trigger-dev_trigger__list_deploys, mcp__plugin_trigger-dev_trigger__whoami
---
Always pass `environment` explicitly (MCP defaults to dev). Never call write tools; you don't have them.
Return at most 25 lines: Verdict · Evidence (run ids, span ids, query results) · Ranked causes · Fix · Doc URL.
Never invent run data: if a tool fails, say what you couldn't see.
```
Both MCP prefixes are listed because dedupe by endpoint may surface either ([07 §1](07-mcp-vs-cli.md)). Plugin agents ignore `hooks`, `mcpServers` and `permissionMode` ([sub-agents](https://code.claude.com/docs/en/sub-agents)), so read-only behaviour comes from the `tools` allowlist, not from a permission mode.

**`code-auditor`**: `tools: Read, Grep, Glob, Bash`; `model: sonnet`. Input: domain, located hits (JSON), the domain's judgment rules from `rules.json`. Output: findings JSON (rule id, severity, confidence, file:line, evidence, fix, doc, `fix_mode`). It reads each located file in full and drops false positives.

**Rejected agents:**
- init/architect agent: discovery needs live AskUserQuestion with the user.
- docs researcher: the lookup is one Read or fetch inline.
- chat-agent builder: the main thread must own the user's files and questions.
- deploy agent: deploys need the user's attention, not isolation.

## 5. The `trigger-ctx` engine

Zero-dependency Node ≥ 18 (`node:fs`, `node:path`, `node:crypto`, `node:child_process` for `git ls-files` only). Envelope from plugin-swiftui ([01 P3](01-reference-plugin-analysis.md)): `{ ok, schema_version, result, next_actions: [{cmd, why}], error }`. **Always exit 0.**

| Subcommand | Used by | Does |
|---|---|---|
| `detect [--brief\|--json]` | H1 (when Node is present), skills, init stage 0 | fingerprint (below); writes the marker |
| `lint --hook` | H2 | reads hook stdin; runs `tier: hook` rules whose `applies_when` matches on the written file; prints `additionalContext` JSON or nothing |
| `scan [path] [--focus …] [--json]` | audit, ship preflight | relevance per domain + tier-1 hits (+ tier-2 ast-grep if available) |
| `guard [--alias]` | H3 | reads hook stdin; tokenises the CLI command or reads the MCP tool input; prints a decision JSON or nothing |
| `docs <topic\|path>` | skills | resolves via `link-index.md`; prints local path or web `.md` URL + `since` + flags |
| `links-check` | plugin CI | status + anchor check ([08 §5](08-doc-link-index.md)) |

**Fingerprint (`detect --json`, abridged):**
```json
{
  "roots": [{ "dir": "apps/jobs", "config": "apps/jobs/trigger.config.ts", "projectRef": "proj_abc123", "dirs": ["./src/trigger"] }],
  "versions": { "sdk": "4.7.4", "cli": "4.7.4", "build": "4.7.4", "aligned": true, "major": 4 },
  "packageManager": "pnpm", "workspaces": "pnpm+turbo",
  "frontend": { "framework": "next", "major": 16, "router": "app" }, "ai": { "major": 6 },
  "features": ["schedules", "realtime-hooks", "chat.agent"],
  "otherLanguages": [], "callerOnly": false,
  "target": { "kind": "cloud" },
  "pinnedDocs": "apps/jobs/node_modules/@trigger.dev/sdk/docs/",
  "overlaps": { "officialSkills": [".claude/skills/trigger-tasks"], "userMcpTrigger": true },
  "worktree": null, "node": "22.11.0"
}
```
`target.kind` is `self-host` when `TRIGGER_API_URL` is set or the current CLI profile's API URL isn't the default. The URL is shown, never a key. Env files are scanned for variable **names** only; values are never read into output.

**Marker:** `${CLAUDE_PLUGIN_DATA}/projects/<sha1(project root)>`.
- Written by H1/`detect` when a Trigger.dev signal exists.
- Read by `marker-gate.sh` with one `test -f`.
- Pruned after 7 days.
- `CLAUDE_PLUGIN_DATA` is the plugin's persistent data directory ([plugins reference](https://code.claude.com/docs/en/plugins-reference)).

## 6. Portability matrix

| Setup | Detected by | H1 output | H2 / H3 | `init` behaviour | MCP / CLI |
|---|---|---|---|---|---|
| TS app with config | `trigger.config.*` at root | full fingerprint | active | `new`/`audit` offered | normal |
| Monorepo, N trigger roots | config via `git ls-files` / bounded `find`; workspace files | ≤ 3 roots + "N more", `configPath` per root | active | init from the right package dir; asks which root | MCP gets `configPath` + `projectRef`; CLI runs in root dir |
| Polyglot (Python/Go/Ruby/PHP + `trigger/` TS package) | `pyproject.toml`/`go.mod`/`Gemfile`/`composer.json` + `trigger/package.json` | fingerprint + "callers: python" | H2 RT-01 on any text file; other rules on TS | creates a self-contained `trigger/` package + REST call site in the host language | normal inside `trigger/` |
| Polyglot, no Trigger.dev yet | `TRIGGER_*` names in `.env*` or nothing | pure-sh subset or nothing | marker only if a signal exists | `polyglot-caller` card | npx needed for init |
| Caller-only app (tasks live elsewhere) | `@trigger.dev/sdk` dep, no config | "caller-only" | RT/TSK-04 rules | point to the tasks repo; REST/SDK call site | MCP with `projectRef` |
| No Node on the machine | `command -v node` fails | pure-sh subset | H2/H3-alias skipped (no Node); H3 exec-form fails → `onFailure: continue` | explains: tasks need Node; REST call sites only | MCP + CLI down → REST + dashboard ([07 §6](07-mcp-vs-cli.md)) |
| Self-host | `TRIGGER_API_URL` or CLI profile | "target: self-host <url>" | active | skips cloud-only steps; key advice host-aware | via CLI profile; no hard-coded cloud URL |
| v3 project | SDK 3.x | "v3 (Cloud EOL)" flag | MIG hook rules gated `sdk>=4` stay silent | offers `migrate-v2-v3` | the project's CLI |
| Git worktree (parallel sessions) | `git rev-parse --git-common-dir` ≠ `--git-dir` | worktree line; exports `TRIGGER_DEV_BRANCH` | active | stage 5 uses `dev --branch` | CLI for dev |
| Windows + Git Bash | — | works | works | works | works |
| Windows without Git Bash | shell-form hooks run in PowerShell and fail | none | H1/H2 fail → `continue`; H3 exec-form node works | `doctor` explains | works |
| Bun runtime | `bun.lockb`/`bun.lock`, `runtime: "bun"` | "runtime bun (experimental)" | active | warns: the CLI still needs Node | `bunx` |
| Headless `-p` / CI | no permission host | as usual | H3 `ask` → call denied with reason | not used | — |

## 7. Rejected components

| Component | Why rejected |
|---|---|
| One skill per official skill (6) or per feature (~20) | Every model-invocable skill costs listing tokens in every session, and activation would stay vocabulary-bound (the original problem). |
| `ask` command | `build` is user-invocable; `/trigger-dev:build <question>` is the same thing. |
| Skill `paths:` | It only *limits* activation; init happens before matching files exist. |
| Skill-scoped `hooks` | H2/H3 must exist even when no skill is loaded. |
| Output style | Changes the whole session's voice; the bridge format belongs inside answers only. |
| LSP server | No Trigger.dev LSP exists; TypeScript's LSP already covers types. |
| Monitors (tail `trigger dev`) | No `userConfig`, run outside the sandbox, interactive only; dev output is available via `dev_server_status`. |
| Workflows | Multi-agent orchestration is user opt-in; `audit` already parallelises with agents. |
| Themes, channels, `settings.json` agent | No need traced to them. |
| Plugin-root `CLAUDE.md` | Not loaded for plugins; `init` offers an opt-in 5-line pointer in the user's own CLAUDE.md/AGENTS.md instead. |
| Wrapping or forking the MCP server | It's the official, maintained surface; wrapping adds drift. Safety lives in H3. |
| A usage corpus (like plugin-swiftui's) | The SDK ships version-pinned docs; that's the better ground truth ([01 P11](01-reference-plugin-analysis.md)). |

## 8. Manifest and MCP snippets

`.claude-plugin/plugin.json`:
```json
{
  "name": "trigger-dev",
  "displayName": "Trigger.dev",
  "version": "0.1.0",
  "description": "Scenario-first Trigger.dev guidance for Claude Code: project fingerprint, discovery, doc-linked answers, edit tripwires, prod guard, audits and the official MCP server.",
  "author": { "name": "yigitkonur", "url": "https://github.com/yigitkonur" },
  "repository": "https://github.com/yigitkonur/plugin-trigger-dev",
  "license": "MIT",
  "keywords": ["trigger.dev", "background-jobs", "ai-agents", "mcp"],
  "userConfig": {
    "steering": {
      "type": "string",
      "title": "Steering level",
      "description": "full = fingerprint + edit tripwires + prod guard; quiet = prod guard only; off = no hooks",
      "default": "full"
    }
  }
}
```
`options` is deliberately not used: it makes the plugin fail to load before Claude Code 2.1.271 ([plugins reference](https://code.claude.com/docs/en/plugins-reference)). An unknown value is treated as `full`. The repository URL is a placeholder (open question 5).

`.mcp.json`:
```json
{ "trigger": { "command": "npx", "args": ["trigger.dev@latest", "mcp"] } }
```

`skills/build/SKILL.md` frontmatter:
```yaml
---
name: build
description: Design and write Trigger.dev code (tasks, schedules, batches, waits and approvals, realtime progress UIs, build extensions, deploys and CI). Use when the project uses Trigger.dev (trigger.config.*, @trigger.dev/* packages) or the user names Trigger.dev. Not for Celery, Sidekiq, BullMQ, plain cron or other job systems in projects without Trigger.dev.
argument-hint: "[what you're building or asking]"
---
```
`build` doesn't use `` !`…` `` injection (model-invoked path; [01 P14](01-reference-plugin-analysis.md)). It runs `trigger-ctx detect --brief` via Bash only when no fingerprint is in context.

## Sources
https://code.claude.com/docs/en/plugins-reference · https://code.claude.com/docs/en/plugins/components · https://code.claude.com/docs/en/skills · https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/mcp · https://trigger.dev/docs/config/extensions/overview · https://trigger.dev/docs/mcp-introduction
