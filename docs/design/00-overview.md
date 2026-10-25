# 00 — Overview: a native Claude Code plugin for Trigger.dev

> **Superseded on install scope.** These design notes (and `docs/spikes.md`) recommend a project-scope install to avoid the standing context cost. The policy now is: installed globally and off, switched on per project (`plugin on trigger-dev`), which has the same zero standing cost everywhere it is off. See `AGENTS.md`. The notes below are kept as the record of why.

**Status:** design plan only. Nothing here is scaffolded.
**Plugin name:** `trigger-dev`. Commands appear as `/trigger-dev:<name>`.
**Targets:** Claude Code ≥ 2.1.295 (needed for `onFailure` on hooks), Trigger.dev SDK v4 (v3 detected and migrated), Trigger.dev Cloud first, self-host safe.

---

## 1. Goal

A developer installs one plugin and can then do anything on Trigger.dev, from a cron job to a production AI chat agent, in any repo layout. The agent behaves like a senior Trigger.dev engineer sitting next to them:

- It **knows the project** before the first question: versions, roots, package manager, frontend, cloud vs self-host.
- It **asks the few questions** the repo can't answer.
- It **picks the primitive** with a reason and a doc link.
- It **checks the code** it writes.
- It **refuses to touch prod by accident**.

The official skills (`triggerdotdev/skills`) are good API cheat-sheets. This plugin keeps their best knowledge but delivers it with the primitive that fits each piece. It also fixes their errors ([02](02-official-skills-audit.md)) and covers what they never touch: deploy/CI, operations, webhooks, non-TS callers, self-host safety.

## 2. Design thesis

> **Fingerprint the project → classify the scenario → pick primitives with a reason → back every recommendation with a doc link → check the result mechanically.**

| Step | Plugin primitive | Why that primitive |
|---|---|---|
| Fingerprint | H1 SessionStart hook + `trigger-ctx detect` | must exist before the first answer; skills can't run first |
| Classify | `build` / `chat-agent` / `diagnose` skills (model-invoked) | intent arrives in natural language; skills load on meaning, not keywords |
| Pick primitives | 13 scenario cards + 10 chat playbooks, read one at a time | the bridge from "what I'm building" to "which feature"; one card ≤ 500 words |
| Link | 3-tier doc lookup (local pinned → MCP `search_docs` → web `.md`) | link, don't copy; local docs match the installed SDK |
| Check | H2 tripwire lint, H3 prod guard, `audit` with 134 rules | silent failures and prod side effects must hold every time, not "if the model remembers" |

## 3. Needs (traceability anchors)

Every component in [04](04-plugin-architecture.md) and every hook in [05](05-steering-and-hooks.md) cites at least one need.

| ID | Need / failure today |
|---|---|
| N1 | Stale or hallucinated APIs (v2/v3 code, removed chat APIs, wrong import paths) |
| N2 | No project context (versions, layout, package manager, monorepo, self-host) |
| N3 | Wrong primitive for the scenario |
| N4 | No discovery, or questions the repo already answers |
| N5 | Silent-failure code patterns (imported `streamText`, `Promise.all` around waits, unchecked Results) |
| N6 | Prod side effects by default (the CLI defaults to prod; prompt overrides change live behaviour) |
| N7 | Live run/ops data is large and needs isolation |
| N8 | Docs drift; skills go stale |
| N9 | Non-TS callers and polyglot repos |
| N10 | Deploy / CI / env vars / preview / version-skew gaps |
| N11 | Beta features recommended blindly (webhooks, Slack/Linear, channels) |
| N12 | Self-host must not break |
| N13 | Cost and reliability advice needs evidence, not guesses |
| N14 | Zero noise and near-zero cost outside Trigger.dev projects |

## 4. Errors and staleness found in the official skills (E1–E23)

Per-skill detail is in [02 §3](02-official-skills-audit.md). E14 was dropped after review: it turned out correct and was kept as a "keeper".

| # | Where | Problem | Evidence |
|---|---|---|---|
| E1 | docs [building-with-ai](https://trigger.dev/docs/building-with-ai) snippet | `defineConfig` imported from `@trigger.dev/sdk/build`, an export that doesn't exist (4.7.4 exports `.`, `./ai`, `./ai/skills-runtime`, `./ai/test`, `./chat`, `./chat-server`, `./chat/react`, `./v3`) | [config/config-file](https://trigger.dev/docs/config/config-file), npm package.json |
| E2 | authoring-chat-agent, setup | Token actions have **no ownership check**; the docs require one in both actions (IDOR). Most severe. | [ai-chat/quick-start](https://trigger.dev/docs/ai-chat/quick-start), [ai-chat/migrating-from-a-route-handler](https://trigger.dev/docs/ai-chat/migrating-from-a-route-handler) |
| E3 | cost-savings | "Waits > 5 s are free" omits that the concurrency slot is only released at 60 s; "< 5 s not checkpointed" is wrong (nothing under 60 s checkpoints; ≤ 5 s is billed) | [wait](https://trigger.dev/docs/wait), [wait-for](https://trigger.dev/docs/wait-for) |
| E4 | cost-savings | Machine cost ratios wrong. Correct values: micro 0.5x, medium-1x ~2.5x, medium-2x ~5x, large-1x ~10x, large-2x ~20x. "large-2x → small-2x ~16x" contradicts its own table. Omits the per-run invocation cost ($0.25 per 10k runs). "Sequential → batch" saves wall time, not compute. | [machines](https://trigger.dev/docs/machines), [pricing](https://trigger.dev/pricing), [how-to-reduce-your-spend](https://trigger.dev/docs/how-to-reduce-your-spend) |
| E5 | cost-savings | `maxDuration` is CPU time excluding waits; it doesn't bound wall-clock time | [runs/max-duration](https://trigger.dev/docs/runs/max-duration) |
| E6 | tasks | Deprecated `queue: { concurrencyLimit }` and `queues.overrideConcurrencyLimit`; current is `concurrency: { total, perKey }`, `concurrencyLimit()`, `concurrencyLimits.*` | [concurrency](https://trigger.dev/docs/concurrency), [queues](https://trigger.dev/docs/queues) |
| E7 | tasks | `wait.for` "durably pauses" omits that waits < 60 s keep the slot | [wait](https://trigger.dev/docs/wait) |
| E8 | setup | "Every task must be a named export" — v4 has hidden tasks | [hidden-tasks](https://trigger.dev/docs/hidden-tasks) |
| E9 | setup | Recommends a "Trigger only" key; presets need Pro/Enterprise. Free/Hobby/self-host only have unrestricted keys. | [apikeys](https://trigger.dev/docs/apikeys) |
| E10 | setup | Hard-codes `retries.enabledInDev: false`; the docs disagree on the init default | [manual-setup](https://trigger.dev/docs/manual-setup), [errors-retrying](https://trigger.dev/docs/errors-retrying) |
| E11 | authoring-chat-agent | `maxAttempts: 1` is correct but omits `oomMachine` (the only retry path) and tool idempotency | [ai-chat/error-handling](https://trigger.dev/docs/ai-chat/error-handling), [ai-chat/patterns/oom-resilience](https://trigger.dev/docs/ai-chat/patterns/oom-resilience) |
| E12 | authoring-chat-agent | `hydrateMessages` shown as primary; `storage` is the successor; no persistence guidance | [ai-chat/transcript-storage](https://trigger.dev/docs/ai-chat/transcript-storage), [ai-chat/migrating-from-hydrate-messages](https://trigger.dev/docs/ai-chat/migrating-from-hydrate-messages) |
| E13 | realtime | Omits tag/batch hooks, `refreshAccessToken`, never-ending tag/batch subscriptions, the 1 h auto-token, 28-day stream retention, empty-stream deletion | [realtime/react-hooks/subscribe](https://trigger.dev/docs/realtime/react-hooks/subscribe), [realtime/auth](https://trigger.dev/docs/realtime/auth), [tasks/streams](https://trigger.dev/docs/tasks/streams) |
| E15 | chat-agent-advanced | "`await` the message write"; the docs prefer `chat.deferBeforeOutput()` | [ai-chat/background-injection](https://trigger.dev/docs/ai-chat/background-injection#chat-deferbeforeoutput) |
| E16 | chat-agent-advanced | "Never give the HITL tool an `execute`"; approvals use `needsApproval` + `execute` (AI SDK 6+) | [ai-chat/patterns/human-in-the-loop](https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop) |
| E17 | chat-agent-advanced | Head Start "serves turn 1"; the warm server runs **step 1 of turn 1** only | [ai-chat/fast-starts](https://trigger.dev/docs/ai-chat/fast-starts) |
| E18 | chat-agent-advanced | Upgrade guidance predates pin following, `versionSkew: "hold"`, `requestUpgrade({ externalDeploymentId })`; `lockToVersion` is inescapable | [ai-chat/patterns/version-upgrades](https://trigger.dev/docs/ai-chat/patterns/version-upgrades) |
| E19 | both chat skills | Nothing on transcript storage (`createLoadTranscriptAction` has no tenant check; format is roll-forward only), webhooks/Slack/Linear, or `OBJECT_STORE_*` | [ai-chat/transcript-storage](https://trigger.dev/docs/ai-chat/transcript-storage), [webhooks/overview](https://trigger.dev/docs/webhooks/overview) |
| E20 | tasks, setup | `pythonExtension` "from `@trigger.dev/build`"; actually `@trigger.dev/python/extension`. No per-extension import paths anywhere. | [config/extensions/pythonExtension](https://trigger.dev/docs/config/extensions/pythonExtension), [config/extensions/overview](https://trigger.dev/docs/config/extensions/overview) |
| E21 | setup | "Only `project` and `dirs` are required": `dirs` is optional, and the docs say a default `maxDuration` **must** be set | [config/config-file](https://trigger.dev/docs/config/config-file), [runs/max-duration](https://trigger.dev/docs/runs/max-duration) |
| E22 | setup | Missing:<br>• Prisma `mode` (required since 4.1.1)<br>• "extensions are no-ops in dev"<br>• `fluent-ffmpeg` as external<br>• runtime pinning (`node` floats; `bun` experimental, and the CLI still needs Node) | [config/extensions/prismaExtension](https://trigger.dev/docs/config/extensions/prismaExtension), [config/config-file](https://trigger.dev/docs/config/config-file), [guides/frameworks/bun](https://trigger.dev/docs/guides/frameworks/bun) |
| E23 | all six | Nothing on deploy/CI:<br>• `TRIGGER_ACCESS_TOKEN`<br>• CI fails on version mismatch<br>• preview workflows need `closed`<br>• skew protection (`--external-id`, ≥ 4.5.12; a stale `TRIGGER_VERSION` → 422)<br>• `syncVercelEnvVars` deprecated with the Vercel integration<br>• dev branches | [github-actions](https://trigger.dev/docs/github-actions), [deployment/atomic-deployment](https://trigger.dev/docs/deployment/atomic-deployment), [vercel-integration](https://trigger.dev/docs/vercel-integration), [deployment/dev-branches](https://trigger.dev/docs/deployment/dev-branches) |

Kept from the official skills (right and valuable):
- `streamText` from the `run` argument
- the `triggerAndWait` Result
- no `Promise.all` around waits
- type-only import + `tasks.trigger`
- the idempotency scope change at 4.3.1
- metadata isn't inherited
- `chat.local` in `onBoot`
- resumable agent-safe login
- "don't fabricate run data without MCP"
- read the version-pinned docs in `node_modules`

## 5. The five most important design decisions

| # | Decision | Alternatives rejected | Why |
|---|---|---|---|
| D1 | **Three model-invoked skills organised by situation** (`build`, `chat-agent`, `diagnose`). Every procedure with side effects is a user-only command (`init`, `new`, `audit`, `ship`, `doctor`). | Port the 6 skills one-to-one; one giant skill; a skill per feature | Activation follows what the user is doing ("building", "chat agent", "something's wrong"), not API vocabulary. User-only commands cost 0 standing tokens. Listing ≈ 450 tokens total. |
| D2 | **Scenario cards + bridge format** ("You're building X. Y fits because Z, not W because… Minimal shape. Watch out for. Docs.") backed by a 3-tier doc lookup. | Copy API docs into references; feature-by-feature reference files | The plugin's value is the decision. API details change, and the installed SDK ships matching docs. |
| D3 | **One deterministic engine** (`trigger-ctx`: detect, lint, scan, guard, docs) with rules as data. **The engine locates, the agent judges.** | Prose-only checklists; LLM hooks per edit; jq/python-based scripts | Silent failures need checks that run every time. Zero-dependency Node only starts in marked Trigger.dev projects. One rule file feeds the hook, the audit and CI. |
| D4 | **Three earned hooks** (+1 optional): H1 fingerprint, H2 edit tripwire (14 rules), H3 prod guard (CLI flag absence, script aliases, MCP writes). All are silent and ≈ 1 `stat` outside Trigger.dev projects, with `onFailure: "continue"`. | UserPromptSubmit router; Stop verifier; prompt/agent hooks; monitors | Each kept hook prevents a named failure that a skill can't prevent deterministically. 14 other hook ideas were rejected with reasons ([05 §5](05-steering-and-hooks.md)). |
| D5 | **Official MCP server unchanged + explicit routing rules.** MCP for live data, CLI for lifecycle, REST for no-Node, dashboard for human-only. Environment always explicit. Project-scope install recommended. | Fork or wrap the MCP server; ship it `--readonly`; CLI only | The MCP server is the official, maintained surface. Dedupe by endpoint means the user's own config wins. The real danger is default environments (CLI prod vs MCP dev), handled by invariant 8 and H3. |

## 6. Architecture at a glance (full tree in [04](04-plugin-architecture.md))

```
trigger-dev/
├── .claude-plugin/plugin.json      userConfig.steering = full | quiet | off
├── .mcp.json                       official server: npx trigger.dev@latest mcp
├── hooks/hooks.json                H1 SessionStart · H2 PostToolUse · H3 PreToolUse · (H4 PostToolUseFailure, phase 3)
├── hooks/session-start.sh, marker-gate.sh
├── bin/trigger-ctx  →  scripts/trigger-ctx.mjs (+ rules/rules.json)
├── skills/  build · chat-agent · diagnose          (model + user)
│            init · new · audit · ship · doctor     (user only)
├── agents/  run-investigator · code-auditor
├── references/  link-index · traps · limits · mcp-vs-cli · rule-catalog
└── evals/
```

Standing cost:
- **Trigger.dev project:** ≈ 900 tokens (listing ≈ 450 + deferred MCP names ≈ 250 + fingerprint ≈ 200).
- **Other repo, project-scope install:** 0.
- **Other repo, user-scope install:** listing + MCP names, no hook output.

## 7. Verified vs assumed

**Verified** (read in full or tested during planning):
- Claude Code spec pages: plugins reference, components, hooks, skills, sub-agents, MCP, permissions, memory, plugin evals, dependencies. Claude Code 2.1.302 is installed locally.
- All six official skills.
- ~190 Trigger.dev doc pages, all returning 200.
- MCP tool schemas in the CLI source.
- The `@trigger.dev/sdk@4.7.4` tarball contents.
- plugin-swiftui's skills, commands, agent, hooks and audit engine.
- All 162 cited doc pages and all 36 cited anchors resolve; plan snippets pass `claude plugin validate --strict`. Output is in [10 §6](10-roadmap-and-open-questions.md).

**Assumed / unverified** (Phase-0 spikes, each with a fallback, [10 §1](10-roadmap-and-open-questions.md)):
- PreToolUse `ask` behaviour under `bypassPermissions`
- whether `Edit(*.ts)`-style `if` rules match Write calls
- where the CLI profile stores `apiUrl`
- MCP `start_dev_server` branch support and which CLI version it runs
- plugin-swiftui's claim that `!` injection doesn't run on model invocation
- hook latency figures (estimates until measured)
- token counts (estimates from character counts)

## 8. Reading guide

| File | Read it for |
|---|---|
| [01](01-reference-plugin-analysis.md) | what plugin-swiftui teaches and what transfers |
| [02](02-official-skills-audit.md) | per-skill audit and the section → new-home traceability table |
| [03](03-capability-map.md) | scenario → primitives → pitfalls → docs map, plus the primitive reference |
| [04](04-plugin-architecture.md) | directory tree, every component with its need IDs, rejected components, snippets, portability |
| [05](05-steering-and-hooks.md) | steering layers, context budget, each hook's six answers, rejected hooks |
| [06](06-flows-init-consult-audit.md) | init / new / consult / audit / diagnose / ship flows, question tree, 134-rule catalog |
| [07](07-mcp-vs-cli.md) | MCP tool inventory, decision matrix, default-env traps, fallbacks |
| [08](08-doc-link-index.md) | doc lookup, gates, seed link index, docs conflicts, freshness CI |
| [09](09-scenario-walkthroughs.md) | 13 stress-test walkthroughs and the revisions they caused |
| [10](10-roadmap-and-open-questions.md) | phases, evals, risks, open questions, verification results |

## Sources
https://code.claude.com/docs/en/plugins-reference · https://code.claude.com/docs/en/hooks · https://code.claude.com/docs/en/skills · https://trigger.dev/docs/building-with-ai · https://trigger.dev/docs/skills · https://github.com/triggerdotdev/skills · plus the pages in §4.
