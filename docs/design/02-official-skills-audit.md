# 02 — Audit of the official Trigger.dev skills

The six skills in `triggerdotdev/skills` are the baseline of intent. They show what Trigger.dev has already decided agents need to know. This file reads every one of them against the docs (docs win), extracts the decision logic worth keeping, and traces every meaningful section to its new home in the plugin.

**Method.** I read all six `SKILL.md` files in full, plus the repo's `README.md`, `AGENTS.md` and `sync-map.json`, and the docs pages [Skills](https://trigger.dev/docs/skills), [Building with AI](https://trigger.dev/docs/building-with-ai) and [Agent rules](https://trigger.dev/docs/mcp-agent-rules). Five parallel readers then checked every claim against the ~190 listed doc pages, and I spot-checked the important ones myself (machines table, wait thresholds, metadata limit, token expiry, config import path, npm package exports). "Evidence" links point to the page that settles each point.

---

## 1. What the skills are, mechanically

| Fact | Consequence for the plugin |
|---|---|
| The GitHub repo is an automatic **mirror**. The skills are authored in the monorepo and shipped inside `@trigger.dev/sdk` (`packages/trigger-sdk/skills`), plus `trigger-getting-started` from the CLI package. | The official content changes with every SDK release. The plugin must not fork it. It should link to the same version-pinned docs instead. |
| `@trigger.dev/sdk@4.7.4` bundles **174 docs** as `.mdx` under `node_modules/@trigger.dev/sdk/docs/` and 5 skills. Webhooks, guides and the management API are **not** bundled. | Best idea in the official set: version-pinned, offline docs. The plugin generalises it into a 3-tier lookup (see [08](08-doc-link-index.md)). |
| Two name sets. The skills.sh mirror renames skills to `trigger-tasks`, `trigger-realtime` and `trigger-setup`. The CLI installer (`npx trigger.dev@latest skills`) installs `trigger-authoring-tasks`, `trigger-realtime-and-frontend` and `trigger-getting-started`. The installer also writes a pointer line into `CLAUDE.md` / `.cursor/rules` ([Skills](https://trigger.dev/docs/skills)). | `doctor` must detect both name sets and the pointer line. Otherwise a user ends up with two overlapping guidance layers. |
| The `sources:` frontmatter cites `.mdx` names that don't all exist. Two skills cite `docs/queue-concurrency.mdx`, which isn't in the 4.7.4 bundle; the docs were split into `queues` and `concurrency`. | Source lists rot silently. The plugin's link index is checked by CI (see [08](08-doc-link-index.md) §5). |
| Activation is description-only. Every description is a list of API names. | They load when the agent is **already writing** Trigger.dev APIs. They don't load when the user describes a goal ("add background jobs", "my cron didn't fire", "Slack bot"). |

---

## 2. Cross-cutting findings

**Activation timing is backwards.** All six descriptions are vocabulary-bound (`chat.agent`, `useTriggerChatTransport`, `runs.subscribeToRun`, …). The moment that matters most is when the user states a goal and the agent has to choose a primitive, and none of them fire there. The plugin fixes this in three ways:
- `build`'s description is written as user situations, scoped to projects that use or name Trigger.dev.
- `diagnose` fires on symptoms.
- A SessionStart fingerprint tells the agent, before the first answer, that this is a Trigger.dev project.

**No discovery.** No skill asks a question or infers anything from the repo. The plugin adds a question tree with skip rules ([06 §1](06-flows-init-consult-audit.md)).

**No project context.** Versions, monorepo roots, package manager, frontend, cloud vs self-host are never established. The fingerprint (H1) does this ([05](05-steering-and-hooks.md)).

**Whole areas missing:**
- deploy / CI / environment variables / preview branches / version-skew protection
- operations and diagnosis (only the cost skill touches live data)
- webhooks, Slack and Linear agents
- triggering from non-TypeScript backends (REST API)
- dev branches for parallel agents and worktrees
- self-hosting beyond one sentence

**Knowledge is mixed with no type discipline.** API details (which change), decision rules (which last), pitfalls (which should be machine-checked) and templates (which go stale) share one body. The plugin routes each type to a different primitive. The table in §5 shows where each piece goes.

**What's genuinely good and kept:**
- the `streamText`-from-the-run-argument rule
- Result objects from `triggerAndWait`
- no `Promise.all` around waits
- type-only import plus `tasks.trigger`
- the idempotency scope change at 4.3.1
- metadata isn't inherited
- `chat.local` initialised in `onBoot`
- the resumable agent-safe login flow
- "don't fabricate run data without MCP"
- reading version-pinned docs from `node_modules`

---

## 3. Per-skill breakdown

### 3.1 `trigger-setup` (CLI: `trigger-getting-started`)

**Activation.** "Load this when a project has no trigger.config.ts yet and the user asks to 'add Trigger.dev', 'set up Trigger.dev', … including in a monorepo. Once the project is set up … switch to the trigger-tasks skill."
- It fires only before setup. Deploy, CI, env vars and extensions in an existing project have no skill at all.

**Embedded decisions.**
- Prefer `init`. Use the manual steps for monorepos, an existing config, or non-interactive shells.
- In an agent session, use `login --email … --name … --no-browser --no-wait`, hand the URL to the user, then resume with `login --no-browser`.
- Self-host: `--api-url` and `TRIGGER_API_URL`. If org creation is disabled, the user creates the org.
- Monorepo: tasks as a package or inside the app; run `dev` where the config lives.
- Bun: `runtime: "bun"`.

**Knowledge types.** Human-handoff protocol (auth) · checklist (manual steps 1–7) · templates (config, first task) · pitfalls (6 common mistakes) · routing (sibling skills).

**Errors and gaps.**

| # | Skill says | Docs say | Evidence |
|---|---|---|---|
| S1 | "The `project` ref and `dirs` are the only required fields." | `dirs` is optional; directories named `trigger` are auto-detected. The docs say you **must** set a default `maxDuration`. | [config-file](https://trigger.dev/docs/config/config-file), [max-duration](https://trigger.dev/docs/runs/max-duration) |
| S2 | "Every task must be a named export." | v4 has hidden tasks; exporting is no longer required. | [hidden-tasks](https://trigger.dev/docs/hidden-tasks), [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) |
| S3 | "Create a named API key with **Trigger only** access." | Presets other than "No restrictions" need Pro or Enterprise. Free, Hobby and self-host have unrestricted keys only. | [apikeys](https://trigger.dev/docs/apikeys) |
| S4 | Hard-codes `retries.enabledInDev: false`. | The docs disagree: `init` enables dev retries per [errors-retrying](https://trigger.dev/docs/errors-retrying), while manual-setup samples set false. | [manual-setup](https://trigger.dev/docs/manual-setup) |
| S5 | "Build extensions (`prismaExtension`, `puppeteer`, …) come from `@trigger.dev/build`." | `pythonExtension` comes from `@trigger.dev/python/extension`, and every extension has its own subpath (`/extensions/core`, `/puppeteer`, `/playwright`, `/prisma`, `/typescript`, …). The skill gives no paths, which invites hallucinated imports. | [pythonExtension](https://trigger.dev/docs/config/extensions/pythonExtension), [extensions overview](https://trigger.dev/docs/config/extensions/overview) |
| S6 | `runtime: "bun"` offered as a plain option. | Bun is experimental, and the CLI itself still runs on Node. `node` floats with the current LTS; pin `node-24` for reproducibility. | [config-file](https://trigger.dev/docs/config/config-file), [Bun guide](https://trigger.dev/docs/guides/frameworks/bun) |
| S7 | Version mismatch framed as "different major". | Any mismatch fails CI deploys. | [github-actions](https://trigger.dev/docs/github-actions) |
| S8 | "Trigger by id, not by calling the task object." | Too absolute. Same-codebase `yourTask.trigger()` is documented and also runs `schemaTask` validation. | [triggering](https://trigger.dev/docs/triggering) |

**Missing scenarios.**
- Prisma `mode` (required since 4.1.1).
- Most extensions are no-ops in `dev`.
- `fluent-ffmpeg` must go in `build.external`.
- Prerequisites: Node 18.20+, TypeScript 5.0.4+.
- Non-TS backends triggering over REST.
- Dev branches for parallel agents.
- `legacyDevProcessCwdBehaviour: false`.
- Multiple configs with the GitHub integration.

### 3.2 `trigger-tasks` (CLI: `trigger-authoring-tasks`)

**Activation.** "Load this whenever you are authoring or editing code inside a /trigger directory, defining a task, or writing backend code that triggers tasks."
- It is keyed on a `/trigger` path. Tasks in other `dirs` (e.g. `src/jobs`) only match on vocabulary.

**Embedded decisions.**
- `schemaTask` for validated payloads.
- `AbortTaskRunError` for permanent failures.
- `batchTriggerAndWait` instead of `Promise.all`.
- Type-only import plus `tasks.trigger` from a backend.
- `scope: "global"` for once-ever idempotency.
- `build.external` for native packages.
- Pass metadata to children explicitly.

**Knowledge types.** Templates (setup, patterns 1–9) · API detail (options lists, schedule payload, queue management) · pitfalls (7 common mistakes, the most valuable part).

**Errors and gaps.**

| # | Skill says | Docs say | Evidence |
|---|---|---|---|
| T1 | "Set `queue: { concurrencyLimit }` on a task"; `queue({ name, concurrencyLimit })`; `queues.overrideConcurrencyLimit / resetConcurrencyLimit`. | Deprecated. Use `concurrency: { total, perKey }`, named `concurrencyLimit({ name, … })`, and `concurrencyLimits.override/reset/pause/resume`. | [concurrency](https://trigger.dev/docs/concurrency), [queues](https://trigger.dev/docs/queues) |
| T2 | "`wait.for({ seconds })` and `wait.until({ date })` durably pause the run." | Waits under 60 s don't checkpoint and keep their concurrency slot. Waits of 5 s or less are billed. | [wait](https://trigger.dev/docs/wait), [concurrency](https://trigger.dev/docs/concurrency#short-time-based-waits-keep-their-slot) |
| T3 | `pythonExtension` listed among `@trigger.dev/build` extensions. | Import from `@trigger.dev/python/extension`. | [pythonExtension](https://trigger.dev/docs/config/extensions/pythonExtension) |
| T4 | Config essentials example has no `maxDuration`. | "You must set a default maxDuration." | [max-duration](https://trigger.dev/docs/runs/max-duration) |
| T5 | `build.external` "for native/WASM packages". | Incomplete. Also used for non-native packages (`fluent-ffmpeg`, `header-generator`). `autoDetectExternal` defaults to true. Values must be package names, not subpaths. The symptom is `No loader is configured for ".node" files`. | [config-file#external](https://trigger.dev/docs/config/config-file#external), [deployment overview](https://trigger.dev/docs/deployment/overview) |
| T6 | "`metadata.*` is readable and writable only inside `run()`." | It also works in lifecycle hooks. Over-limit updates return 413 and only log `Failed to flush metadata`; they never throw. | [metadata](https://trigger.dev/docs/runs/metadata) |
| T7 | Schedules section. | Omits the default 60-minute spreading window (looks like "late" runs), UTC string crons, the free-plan hourly floor, and that `deduplicationKey` is per project, not per environment. | [scheduled](https://trigger.dev/docs/tasks/scheduled) |

**Missing.**
- Lifecycle hooks in v4 shape (single object argument, `onStartAttempt`, `onWait`/`onResume`, `onCancel`, middleware plus locals, global hooks in `init.ts`).
- `maxDuration` semantics (CPU time, waits excluded).
- `ttl`, machines and `retry.outOfMemory`, priority, tags limits, heartbeats, versioning and version locking.
- Streams v2 and input streams.
- Run usage and cost.
- Bulk actions and replay.
- Debounce `maxDelay`.
- Waitpoint completion over HTTP (CORS).
- All numeric limits.

### 3.3 `trigger-realtime` (CLI: `trigger-realtime-and-frontend`)

**Activation.** "Load when wiring a frontend (React/Next.js/Remix) or backend-for-frontend to show live run progress … NOT for writing the backend task itself."
- It is split from the producer side (`metadata.set`, `streams.define`), so a progress-UI task needs two skills, and nothing loads the second one.

**Embedded decisions.**
- Mint in the backend, pass to the frontend, subscribe with a hook.
- Read token vs trigger token.
- `useRealtimeRun` instead of polling `useRun`.
- `skipColumns` for status-only UIs.
- `enabled: !!handle`.

**Knowledge types.** Template-heavy (8 patterns) · pitfalls (6) · decision rules (token kinds).

**Errors and gaps.**

| # | Gap | Evidence |
|---|---|---|
| R1 | Missing `useRealtimeRunsWithTag` and `useRealtimeBatch` (with the 24 h `createdAt` cap) and `stopOnCompletion`. | [subscribe hooks](https://trigger.dev/docs/realtime/react-hooks/subscribe) |
| R2 | Missing `refreshAccessToken` (re-mint on 401/403) and the 1 h auto-generated `handle.publicAccessToken`. Tokens max out at 30 days. | [realtime auth](https://trigger.dev/docs/realtime/auth) |
| R3 | `subscribeToRunsWithTag` and `subscribeToBatch` never complete, so you must `break`. The skill only says `subscribeToRun` ends. | [backend subscribe](https://trigger.dev/docs/realtime/backend/subscribe) |
| R4 | Stream retention is 28 days. An empty stream across a ~1 h wait may be deleted (`S2Error`). | [streams](https://trigger.dev/docs/tasks/streams) |
| R5 | Input streams need SDK ≥ 4.4.2, `.send` is capped at 1 MB, and the token scope isn't shown. | [streams](https://trigger.dev/docs/tasks/streams), [backend input streams](https://trigger.dev/docs/realtime/backend/input-streams) |
| R6 | A browser can't call `token.url` (no CORS). Use `useWaitToken` or the CORS-enabled complete endpoint. | [wait-for-token](https://trigger.dev/docs/wait-for-token) |
| R7 | Realtime connection limits per plan are missing (10 / 50 / 500+). | [limits](https://trigger.dev/docs/limits#realtime-connections) |

### 3.4 `trigger-cost-savings`

**Activation.** "Use when asked to reduce spend, optimize costs, audit usage, right-size machines, or review task efficiency."
- Correctly on-demand. It is the only skill that combines static and live (MCP) analysis.

**Embedded decisions.**
- With MCP, do run analysis. Without it, do static only and never fabricate data.
- I/O-bound tasks stay small.
- Debounce bursty triggers.
- `AbortTaskRunError` for permanent failures.

**Knowledge types.** Checklist (9 static checks, 4 live checks) · report template · numeric table · principles.

**Errors.**

| # | Skill says | Docs / pricing say | Evidence |
|---|---|---|---|
| C1 | "Waits > 5 seconds are free — checkpointed." | Compute is free after 5 s, but the concurrency slot is released only at 60 s. Waiting "doesn't always free concurrency". | [wait-for](https://trigger.dev/docs/wait-for), [how-to-reduce-your-spend](https://trigger.dev/docs/how-to-reduce-your-spend) |
| C2 | "Short waits — `wait.for()` under 5 seconds (not checkpointed)." | Nothing under 60 s checkpoints. Waits of 5 s or less are billed. | [wait](https://trigger.dev/docs/wait) |
| C3 | Relative cost table: micro 0.25x, medium-1x 2x, medium-2x 4x, large-1x 8x, large-2x 16x. | Per-second prices give micro 0.5x, medium-1x ~2.5x, medium-2x ~5x, large-1x ~10x, large-2x ~20x. The docs' machines page lists no ratios at all. | [machines](https://trigger.dev/docs/machines), [pricing](https://trigger.dev/pricing) |
| C4 | Example report: `large-2x`→`small-2x` "~16x". | 8x by its own table, ~10x by pricing. | same |
| C5 | "Missing `maxDuration`" as a runaway-cost guard. | `maxDuration` is CPU time per attempt, excluding waits. It doesn't bound wall clock for wait-heavy tasks. | [max-duration](https://trigger.dev/docs/runs/max-duration) |
| C6 | "Sequential `triggerAndWait` → batch" as a cost item. | The parent isn't billed while waiting, so this saves wall time, not compute. | [triggering](https://trigger.dev/docs/triggering) |
| C7 | "`maxAttempts` > 5" threshold. | Not in the docs (default example is 3; spend guide suggests lowering, e.g. 2). | [how-to-reduce-your-spend](https://trigger.dev/docs/how-to-reduce-your-spend) |

**Missing.**
- The per-run invocation cost ($0.25 per 10k runs), which matters for floods of tiny runs.
- Billing limits and alerts.
- Per-trigger machine override.
- `retry.outOfMemory`.
- `usage.getCurrent()` / `costInCents` for measuring.
- TRQL cost queries (`compute_cost` per task).
- Duplicate schedules without `deduplicationKey` as a documented cost bug.

### 3.5 `trigger-authoring-chat-agent`

**Activation.** "Load this when building, modifying, or debugging a chat backend … or its React transport, when declaring typed tools or custom data parts, or when migrating a plain AI SDK streamText route."
- It won't fire on "add an AI assistant", "Slack agent" or "chat survives refresh".

**Embedded decisions (excellent, kept).**
- Return the `StreamTextResult`, or `chat.pipe()` from nested helpers.
- Take `streamText` from the run argument (or `ChatStreamText` / `chat.toStreamTextOptions()`).
- Declare tools on the config **and** pass them back.
- `chat.local` init in `onBoot`.
- Forward `signal`.
- Never clear `lastEventId` on `endRun`.
- Sanitise `onError`.

**Knowledge types.** Templates (agent, two server actions, transport) · decision rules (return vs pipe, tools) · API detail (builder, data parts) · pitfalls (7) · checklist (migration).

**Errors and gaps.**

| # | Issue | Evidence |
|---|---|---|
| A1 | **Security, most severe finding:** the template server actions (`startChatSession`, `mintChatAccessToken`) have **no ownership check**. The docs require authorising `chatId` in both actions; otherwise any signed-in user can mint a token for another user's conversation. | [quick-start](https://trigger.dev/docs/ai-chat/quick-start), [migrating-from-a-route-handler](https://trigger.dev/docs/ai-chat/migrating-from-a-route-handler) |
| A2 | "`chat.agent` runs with `maxAttempts: 1` internally" is correct ([error-handling](https://trigger.dev/docs/ai-chat/error-handling)), but it omits `oomMachine` (the only retry path, 2 attempts, OOM only) and that tools must therefore be idempotent. | [oom-resilience](https://trigger.dev/docs/ai-chat/patterns/oom-resilience) |
| A3 | Hook order shows `storage.loadContext (or the deprecated hydrateMessages)`, but there is no persistence guidance at all: no TranscriptStorage, no `createLoadTranscriptAction` (which does **no** tenant check), no `runTranscriptStorageTests`, no "roll forward only". | [transcript-storage](https://trigger.dev/docs/ai-chat/transcript-storage) |
| A4 | Never states that a call-site `system` throws if a managed prompt is set. | [backend](https://trigger.dev/docs/ai-chat/backend) |
| A5 | Stop after a page-refresh resume needs `transport.stopGeneration(chatId)`; `useChat`'s `stop()` no longer reaches the backend. | [frontend](https://trigger.dev/docs/ai-chat/frontend) |
| A6 | Versions missing: SDK ≥ 4.5.0, Node ≥ 18.20, React 18/19, AI SDK 6+ for `needsApproval`, `@ai-sdk/otel` on AI SDK 7. | [reference](https://trigger.dev/docs/ai-chat/reference) |
| A7 | Missing: fast starts, testing (`mockChatAgent`), the MCP chat smoke test, non-React clients (client protocol), `AgentChat`, self-host object store. | [fast-starts](https://trigger.dev/docs/ai-chat/fast-starts), [testing](https://trigger.dev/docs/ai-chat/testing), [mcp](https://trigger.dev/docs/ai-chat/mcp) |

### 3.6 `trigger-chat-agent-advanced`

**Activation.** "Load this when working on the raw Sessions primitive … sub-agents, human-in-the-loop, steering, actions, background injection, fast starts …, compaction, recovery boot, OOM, large payloads, chat.local, … mockChatAgent, or prerelease/version upgrades."
- Purely keyword-driven, and it fires only once the agent is already using the named API. The real triggers are symptoms: "first reply takes 4 s", "history lost on refresh", "conversation exceeds context", "deploy broke chats".

**Embedded decisions (kept).**
- Raw `sessions` when chat semantics don't fit.
- `AgentChat` in a generator tool with `toModelOutput`.
- System lane for directives, conversation lane for facts.
- Edit-only action returns nothing; answering returns `chat.turn()`.
- Never re-POST `/api/v1/sessions` to send a follow-up.
- Session-scoped token, not the `x-trigger-jwt` header.
- Schema-only tools in the Head Start route.

**Errors and gaps.**

| # | Skill says | Docs say | Evidence |
|---|---|---|---|
| V1 | "`chat.defer` for the message-history write … `await` that write inline." | Current guidance is `chat.deferBeforeOutput()` (no TTFT cost). Transcript storage already persists the incoming message. | [background-injection](https://trigger.dev/docs/ai-chat/background-injection#chat-deferbeforeoutput) |
| V2 | "Giving the HITL tool an `execute`" is always wrong. | Approvals use `needsApproval: true` **with** `execute` (AI SDK 6+) and `addToolApprovalResponse`. Only question tools have no `execute`. | [human-in-the-loop](https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop#approve-a-tool-before-execution) |
| V3 | Head Start "serves turn 1 … then hands off on turn 2+". | The warm server runs **step 1 of turn 1** only. Tool execution and step 2+ run in the agent; a pure-text first turn exits the agent without an LLM call. | [fast-starts](https://trigger.dev/docs/ai-chat/fast-starts#head-start) |
| V4 | Upgrades via `requestUpgrade` + `clientData.protocolVersion`. | Out of date. Pinned sessions now follow deploys automatically; `versionSkew: "hold"`, `requestUpgrade({ externalDeploymentId })`. `lockToVersion` can't be escaped. | [version-upgrades](https://trigger.dev/docs/ai-chat/patterns/version-upgrades) |
| V5 | "`onRecoveryBoot` fires only when a partial assistant message exists." | Never fires with `hydrateMessages`. The splice needs ≥2 in-flight users (one in-flight user drops the partial). `cause` is always `"unknown"`. The docs' own pages disagree on details. | [recovery-boot](https://trigger.dev/docs/ai-chat/patterns/recovery-boot), [persistence-and-replay](https://trigger.dev/docs/ai-chat/patterns/persistence-and-replay) |
| V6 | No transcript storage, prompt caching, native compaction, branching, tool-result auditing, skills bundling, code sandbox, trusted edge signals, detached head start. | — | respective `ai-chat/patterns/*` pages |
| V7 | No webhooks, `chat.event` session routing, channels, Slack, Linear. All are **private beta**. | — | [webhooks overview](https://trigger.dev/docs/webhooks/overview), [slack](https://trigger.dev/docs/webhooks/slack) |
| V8 | Self-host: the default snapshot needs `OBJECT_STORE_*`; without it and without `storage`, continuations boot empty. | — | [persistence-and-replay](https://trigger.dev/docs/ai-chat/patterns/persistence-and-replay) |

### 3.7 The docs pages about AI tooling

- **[Building with AI](https://trigger.dev/docs/building-with-ai)** recommends "install both" (skills and MCP), which the plugin does in one install. Its copy-paste snippet contains a **wrong import**: `import { defineConfig } from "@trigger.dev/sdk/build"`.
  - The 4.7.4 package exports `.`, `./ai`, `./ai/skills-runtime`, `./ai/test`, `./chat`, `./chat-server`, `./chat/react`, `./package.json` and `./v3`, and no `./build`.
  - [config-file](https://trigger.dev/docs/config/config-file) uses `@trigger.dev/sdk`.
  - It also says "Batch trigger (up to 1,000 items)", which is correct only for SDK ≥ 4.3.1.
- **[Skills](https://trigger.dev/docs/skills)** documents the installer and the CLAUDE.md pointer. The plugin's `doctor` uses this to detect overlap.
- **[MCP introduction](https://trigger.dev/docs/mcp-introduction)** gives the exact Claude Code config the plugin ships verbatim.

---

## 4. Overlaps and seams

| Seam | Problem today | Plugin answer |
|---|---|---|
| Progress UI = task side (`metadata`, `streams.define`) + consumer side (hooks, tokens) | Split across `trigger-tasks` and `trigger-realtime`; neither loads the other | One scenario card `progress-ui` covering both halves |
| Chat agent with a live UI, cost controls and deploy | Spread over 2 chat skills + realtime + cost + nothing for deploy | `chat-agent` playbooks per symptom; `deploy-ci` card; `audit --focus chat` |
| Setup → first task → deploy | `trigger-setup` hands off to `trigger-tasks`; nothing covers deploy | `init` (ends with a proven run) → `new` → `ship` |
| Cost review needs live data and code | `trigger-cost-savings` does both in one context window | `audit --focus cost --live`: static rules in the main thread, live evidence via `run-investigator` |
| Chat hooks | Described in both chat skills with different depth | One `chat-agent` SKILL.md with the hook table; playbooks link the docs |

---

## 5. Traceability: every meaningful section → new home → reason

Routing key by knowledge type: **decision rule** → skill body or scenario card · **API detail** → link index (docs are authoritative) · **pitfall** → audit rule (tripwire if precise) · **checklist** → command flow · **template** → `init` only where `init -y` can't scaffold, otherwise a ≤15-line "minimal shape" inside a card.

| Skill · section | Type | New home | Reason |
|---|---|---|---|
| setup · "prefer `init`" | decision | `init` stage 4c | user-invoked flow with side effects |
| setup · auth needs the human / resumable login | protocol | `init` stage 4a (verbatim flow), `doctor` | human gate must be explicit and resumable |
| setup · manual steps 1–7 | checklist + template | `init` manual branch + `templates/` (polyglot, manual config) | `init -y` covers the rest |
| setup · monorepos | decision | fingerprint (H1) lists roots; `init` stage 0; [04 §6](04-plugin-architecture.md) portability | detect instead of describe |
| setup · triggering from your app | API detail + decision | `build` invariant 4; `background-job` card; `polyglot-caller` card for REST | the decision is the point; the API is linked |
| setup · mistakes 1–6 | pitfalls | rules MIG-01/MIG-02/MIG-07, RT-12, TSK-27; `init` stage 4 notes | machine-checkable |
| tasks · schemaTask | API + decision | `background-job` card ("untrusted payload → schemaTask; `tasks.trigger` doesn't validate") | adds the validation nuance |
| tasks · retries / AbortTaskRunError / catchError | API + decision | `background-job` card + TSK-08/TSK-09 + COST-02 | decision + rule |
| tasks · trigger + Result | pitfall | invariant 2; rule TSK-02; tripwire TSK-01 | silent-failure class |
| tasks · backend trigger with type-only import | decision | invariant 4; RT-12 | |
| tasks · idempotency keys | decision + pitfall | invariant 5; TSK-10/11/12; `webhook-driven` card | scope change is a stale-knowledge trap |
| tasks · waits and metadata | decision + pitfall | invariant 6; `long-workflow-waits`, `progress-ui` cards; TSK-15/20 | corrected (T2, T6) |
| tasks · scheduled tasks | API + decision | `scheduled-pipeline` card; SCH-01..07 | adds window, UTC, dedup scope |
| tasks · queues and concurrency | API (stale) | `fan-out-batch` card with current API; QUE-01..06 | corrected (T1) |
| tasks · config essentials | API | link index + `heavy-compute` card (extension paths) + CFG rules | corrected (T3–T5) |
| tasks · logging | API | link index only | pure API detail |
| tasks · mistakes 1–7 | pitfalls | `build` invariants 2–7 + tripwire TSK-01 + rules TSK-02/03, RT-12, TSK-20/21, CFG-05, TSK-12 | |
| realtime · token flow | decision | `progress-ui` card; RT-02/RT-03 | merged with the producer side |
| realtime · patterns 1–8 | templates | `progress-ui` card ("which hook for which UI") + link index | templates go stale; the hook choice doesn't |
| realtime · mistakes 1–6 | pitfalls | RT-02..RT-07 | |
| cost · canonical guidance pointer | link | link index (`how-to-reduce-your-spend`) | |
| cost · MCP prerequisite + "don't fabricate" | protocol | `diagnose` + `audit --live` preamble; [07](07-mcp-vs-cli.md) fallbacks | kept verbatim in spirit |
| cost · static checks 1–9 | checklist | COST-01..07, TSK-16, QUE-05 with corrected numbers | audit is the right primitive |
| cost · run analysis 2a–2d | live procedure | `run-investigator` agent + TRQL ideas in `diagnose/trql.md` | isolates big outputs |
| cost · machine table | numbers (wrong) | `references/limits.md` with pricing-page ratios and the invocation cost | corrected (C3, C4) |
| cost · report template | template | `audit` REPORT.md format | |
| chat-authoring · three pieces + setup | template | `chat-agent/playbooks/greenfield.md` with ownership checks | corrected (A1) |
| chat-authoring · return vs pipe, typed tools, data parts, builder | decision + API | `chat-agent` SKILL.md decision tree; link index | |
| chat-authoring · hooks + stop | API + pitfall | hook table in `chat-agent` SKILL.md; CHT-02, CHT-04 | |
| chat-authoring · migrating a route | checklist | `playbooks/migrate-route-handler.md`; CHT-24 | |
| chat-authoring · mistakes | pitfalls | tripwires CHT-01, CHT-04; rules CHT-03/05/13/14 | |
| advanced · sessions / AgentChat | decision + API | `playbooks/server-and-channel-callers.md` | |
| advanced · sub-agents | decision + template | `playbooks/sub-agents-tools-sandbox.md` | |
| advanced · defer + inject | decision | `playbooks/long-conversations.md` (lanes) + CHT-09 | corrected (V1) |
| advanced · compaction | decision + pitfall | `playbooks/long-conversations.md`; CHT-10 | |
| advanced · actions | decision + API | `playbooks/persistence.md`; CHT-11 | |
| advanced · fast starts | decision | `playbooks/fast-first-reply.md`; CHT-15 | corrected (V3) |
| advanced · chat.local | pitfall | tripwire CHT-04 | |
| advanced · pending messages | API | `playbooks/long-conversations.md` + link | |
| advanced · recovery and upgrades | decision | `playbooks/resilience.md`; CHT-19 | corrected (V4, V5) |
| advanced · mockChatAgent | API + template | `playbooks/test-verify-ship.md`; CHT-25 | |
| advanced · wire protocol | API | link to [client-protocol](https://trigger.dev/docs/ai-chat/client-protocol) from `server-and-channel-callers` | too detailed to carry; non-React clients only |
| advanced · mistakes | pitfalls | CHT-06, CHT-09, CHT-16, CHT-17 | |
| all · "read bundled docs in node_modules" | link strategy | 3-tier lookup ([08 §2](08-doc-link-index.md)) | generalised |
| all · version footers | provenance | dropped | fingerprint reports installed versions |
| building-with-ai · context snippet | rules | superseded by H1 + skills; `init` offers a 5-line pointer (opt-in) | snippet has E1; static text goes stale |

Dropped on purpose: per-skill "References / sibling skills" sections (replaced by routing in `build`); long option lists (link index); code that `init -y` already generates.

---

## 6. Improvement summary (what the plugin does that the six skills can't)

1. **Right moment.** It fires on project context (fingerprint), on user goals (`build` scoped to Trigger.dev projects) and on symptoms (`diagnose`), not only on API vocabulary.
2. **Ask before assuming.** A question tree that skips anything the repo already answers.
3. **Mechanical checks.** 14 tripwire rules and 134 audit rules ([06 §4.3](06-flows-init-consult-audit.md)), so the costliest mistakes are caught even when the model ignores prose.
4. **Prod safety.** The guard catches CLI commands that default to prod and live prompt overrides.
5. **Correctness.** 22 errors and stale statements fixed (E1–E23 in [00 §4](00-overview.md); E14 was reclassified as correct during review and dropped), plus docs-internal conflicts recorded with the conservative reading.
6. **Coverage.** Deploy/CI/skew protection, operations/diagnosis, webhooks (beta-gated), REST callers, dev branches, self-host safety.
7. **Freshness.** Links instead of copies, a version gate, and CI that checks every URL and anchor against `llms.txt`.

## Sources
https://github.com/triggerdotdev/skills · https://trigger.dev/docs/skills · https://trigger.dev/docs/building-with-ai · https://trigger.dev/docs/mcp-agent-rules · plus every page linked in the tables above.
