# 03 — Capability map (scenario first, primitives second)

This is the knowledge model behind `build`'s 13 scenario cards and `chat-agent`'s playbooks. Part A is organised by **what the user is building**. Part B is a per-primitive reference (what it solves, when to reach for it, when not to, common mistakes, related features, canonical doc). The plugin never copies doc prose: each card holds the decision, the facts that decide it, the pitfalls, and the link.

Conventions:
- **Since** gives the minimum SDK version (checked against the fingerprint).
- **Beta** means private beta, access on request.
- **Cloud** means cloud-only or plan-gated.
- All URLs are under `https://trigger.dev/docs/`. The plugin fetches the `.md` variant, or the local pinned `.mdx`.

---

## Part A — Scenarios (the 13 `build` cards + chat agents)

Each card follows the same fixed shape: *You're building… · Signals · Primitives and why · Decisions → deciding facts · Config/extensions · Pitfalls · Ask only if not inferable · Docs.*

### A1. Background job triggered from your app (`background-job`)
- **You're building:** work that's too slow or flaky for a request: emails, PDF generation, LLM calls, syncs.
- **Signals:** "in the background", "queue this", "don't block the request", serverless timeouts.
- **Primitives and why:**
  - `task` or `schemaTask`. It's durable with no timeout, retries by default, and `schemaTask` validates untrusted payloads.
  - Trigger from app code with `tasks.trigger<typeof t>("id", payload)` and a **type-only** import. That keeps task code out of the app bundle.
  - Same-codebase `yourTask.trigger()` is fine too, and also validates `schemaTask` payloads.
- **Decisions:**
  - Fire-and-forget (`trigger`) vs result needed. A result means the caller must be another task (`triggerAndWait`) or must subscribe (Realtime / `runs.subscribeToRun`).
  - Retries vs `AbortTaskRunError` for permanent errors.
  - Idempotency key when the trigger path can repeat (user double-clicks, webhook redelivery).
- **Pitfalls:**
  - Unawaited `trigger()`.
  - Secrets in payloads (payloads are visible in the dashboard).
  - Payload over 3 MB: pass a reference instead.
  - `tasks.trigger` does **not** run `schemaTask` validation at trigger time.
- **Ask only if:** the language of the triggering backend can't be detected. If it's not TS, switch to A9.
- **Docs:** [tasks/overview](https://trigger.dev/docs/tasks/overview) · [triggering](https://trigger.dev/docs/triggering) · [tasks/schemaTask](https://trigger.dev/docs/tasks/schemaTask) · [errors-retrying](https://trigger.dev/docs/errors-retrying) · [idempotency](https://trigger.dev/docs/idempotency)

### A2. Scheduled pipeline (`scheduled-pipeline`)
- **You're building:** a nightly import, an hourly report, or per-user reminders.
- **Primitives:**
  - `schedules.task` with a declarative `cron` for fixed schedules.
  - `schedules.create({ task, cron, timezone, externalId, deduplicationKey })` for per-user or dynamic schedules.
  - `delay` for a *single* future run (no cron needed).
- **Deciding facts:**
  - A string cron is UTC; use `{ pattern, timezone }` for business-local times.
  - New schedules get a **60-minute spreading window** by default; `window: "0m"` fires on the exact minute.
  - `deduplicationKey` is per **project**, not per environment, so include the environment name.
  - Dev schedules fire only while `trigger dev` runs. Staging and prod fire only for the latest deployment.
  - Cloud Free rejects crons more frequent than hourly.
  - Long runs that can overlap need `ttl`.
- **Pitfalls:** six-field cron (no seconds field); `schedules.task` with nothing attached never fires; duplicate imperative schedules double-fire (and cost more).
- **Docs:** [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) · [limits#schedules](https://trigger.dev/docs/limits#schedules) · [management/schedules/create](https://trigger.dev/docs/management/schedules/create)

### A3. Fan-out / batch processing (`fan-out-batch`)
- **You're building:** "process 50k rows", "one run per customer", "map-reduce over files".
- **Primitives:**
  - `batchTrigger` / `batch.trigger` for fire-and-forget: up to 1,000 items per call (SDK ≥ 4.3.1, 500 before), each ≤ 3 MB, `AsyncIterable` input allowed.
  - `batchTriggerAndWait` when the parent needs results. The parent checkpoints and isn't billed while waiting.
  - `concurrency: { total, perKey }` + `concurrencyKey` for per-tenant fairness.
  - Named `concurrencyLimit()` to share a cap across tasks (e.g. one external API).
- **Deciding facts:**
  - API rate limit is 1,500 req/min, so a `trigger()` in a loop is wrong.
  - The batch token bucket is plan-dependent; handle `BatchTriggerError.isRateLimited`.
  - `triggerAndWait` locks children to the parent's version; `trigger` doesn't.
  - Partial failures: each `runs[i].ok` must be handled.
- **Pitfalls:**
  - `Promise.all` around `triggerAndWait` ("Parallel waits are not supported").
  - `perKey` without `total` grows unbounded.
  - v4 `batchTrigger` no longer returns `.runs` (use `batch.retrieve`).
  - Children don't inherit tags, metadata or concurrency.
- **Docs:** [triggering](https://trigger.dev/docs/triggering) · [concurrency](https://trigger.dev/docs/concurrency) · [queues](https://trigger.dev/docs/queues) · [limits#batch-trigger-rate-limits](https://trigger.dev/docs/limits#batch-trigger-rate-limits) · [troubleshooting#parallel-waits-are-not-supported](https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported)

### A4. Long-running workflow with waits (`long-workflow-waits`)
- **You're building:** onboarding drips, trial expiry, "wait 3 days then check".
- **Primitives:**
  - `wait.for` / `wait.until`, durable from seconds to years.
  - Wait idempotency (`idempotencyKey` on waits) so retries skip completed waits.
  - `delay` on the trigger instead of a leading wait.
- **Deciding facts:**
  - Waits over 5 s aren't billed.
  - **Waits under 60 s don't checkpoint and keep the concurrency slot.**
  - `maxDuration` counts CPU time only, so it doesn't cap wall-clock length.
  - Delayed runs execute on whatever version is current when they start.
- **Pitfalls:**
  - `setTimeout`/sleep loops.
  - Polling with short waits that eat concurrency.
  - A stream left empty across a ~1 h wait can be deleted (`S2Error`).
  - Browser handles (Playwright) don't survive waits.
- **Docs:** [wait](https://trigger.dev/docs/wait) · [wait-for](https://trigger.dev/docs/wait-for) · [wait-until](https://trigger.dev/docs/wait-until) · [concurrency#short-time-based-waits-keep-their-slot](https://trigger.dev/docs/concurrency#short-time-based-waits-keep-their-slot)

### A5. Human-in-the-loop and external callbacks (`human-in-the-loop-and-callbacks`)
- **You're building:** approval steps, "wait for the payment webhook", "resume when the build finishes".
- **Primitives:**
  - **Waitpoint tokens**: `wait.createToken({ timeout, idempotencyKey, tags })` → `wait.forToken<T>(id)` → `wait.completeToken(id, data)` from anywhere, over HTTP, or via `useWaitToken` in React.
  - **Input streams** (SDK ≥ 4.4.2): typed data bound to one run (`.wait()` suspends, `.once`/`.on` stay alive).
  - **Webhook waiters** (Beta): wait for a provider event matched by fields.
  - Chat approvals are in the chat playbooks.
- **Deciding facts:**
  - `token.url` is server-to-server with **no CORS**; browsers use `useWaitToken` or the CORS-enabled complete endpoint.
  - With no timeout, a token waits forever.
  - The run is suspended, so no compute is used while waiting.
  - **Create waiters before you trigger the external action.**
- **Pitfalls:** a waiter created after the provider call misses fast events; `forToken` result not checked (timeout is the only error); fetching `token.url` from the browser.
- **Docs:** [wait-for-token](https://trigger.dev/docs/wait-for-token) · [realtime/react-hooks/use-wait-token](https://trigger.dev/docs/realtime/react-hooks/use-wait-token) · [tasks/streams](https://trigger.dev/docs/tasks/streams) · [webhooks/waiters](https://trigger.dev/docs/webhooks/waiters) (Beta) · [management/waitpoints/complete](https://trigger.dev/docs/management/waitpoints/complete)

### A6. Progress / results UI (`progress-ui`)
- **You're building:** a progress bar, status badges, live LLM text, or a "Run" button in the browser.
- **Primitives:**
  - **Producer side:** `metadata.set/increment/append` (state up to 256 KB) and/or `streams.define` + `.pipe()` (tokens, chunks, long logs; 28-day retention, 300 MiB per stream).
  - **Consumer side:** `@trigger.dev/react-hooks` (`useRealtimeRun`, `useRealtimeRunsWithTag`, `useRealtimeBatch`, `useRealtimeStream`, `useTaskTrigger` / `useRealtimeTaskTrigger`, `useWaitToken`), or backend `runs.subscribeToRun`.
- **Deciding facts:**
  - Metadata is for state, streams are for continuous data.
  - **Public access token** (read; `auth.createPublicToken({ scopes })`, default 15 min, max 30 days, no scopes means no access) vs **trigger token** (`auth.createTriggerPublicToken`, single-use, required for browser triggering).
  - `handle.publicAccessToken` is auto-scoped to that run for 1 h.
  - Tag subscriptions and batch subscriptions never end.
  - Realtime connection limits depend on plan.
- **Pitfalls:**
  - Secret key in the browser.
  - Token without scopes; `runs: true` in production.
  - Polling with `useRun`.
  - Missing `"use client"`.
  - Status UIs shipping payload/output (use `skipColumns`).
  - Metadata over 256 KB only logs `Failed to flush metadata`.
- **Ask only if:** a frontend exists and it's unclear whether the user wants status or streamed text.
- **Docs:** [realtime/overview](https://trigger.dev/docs/realtime/overview) · [realtime/auth](https://trigger.dev/docs/realtime/auth) · [realtime/react-hooks/subscribe](https://trigger.dev/docs/realtime/react-hooks/subscribe) · [realtime/react-hooks/streams](https://trigger.dev/docs/realtime/react-hooks/streams) · [runs/metadata](https://trigger.dev/docs/runs/metadata) · [tasks/streams](https://trigger.dev/docs/tasks/streams)

### A7. Heavy compute: browser, media, Python, native (`heavy-compute`)
- **You're building:** PDFs/screenshots, ffmpeg transcodes, Python ML, image processing with sharp.
- **Primitives:** build extensions + machine presets.

| Need | Extension (import path) | Gotchas |
|---|---|---|
| Headless Chrome via Puppeteer | `puppeteer()` (`@trigger.dev/build/extensions/puppeteer`) | Deploy-only; don't set `PUPPETEER_EXECUTABLE_PATH` in dev. Scraping on Cloud must use a proxy (ToS). |
| Playwright | `playwright({ browsers })` (`/extensions/playwright`) | Leave `version` unset (a mismatch breaks). Browsers don't survive waits. Deploy-only. |
| Lightpanda | `lightpanda()` (`/extensions/lightpanda`) | Dev needs the binary on PATH. |
| Remote browser (Browserless etc.) | none | Fails silently on the Bun runtime → `runtime: "node"`. |
| ffmpeg | `ffmpeg()` (`/extensions/core`) | Put `fluent-ffmpeg` in `build.external`; child processes count toward OOM. |
| Python | `pythonExtension({ scripts, requirementsFile })` (`@trigger.dev/python/extension`) | `requirementsFile` is prod-only; `devPythonBinaryPath` for dev; can't set both `requirements` options. |
| apt packages | `aptGet({ packages })` (`/extensions/core`) | Image only. |
| Native/WASM (sharp, re2, sqlite3) | `build.external` | Symptom: `No loader is configured for ".node" files`. |
| Prisma | `prismaExtension({ mode })` (`/extensions/prisma`) | `mode` required ≥ 4.1.1: legacy (≤6.x client-js, migrations), engine-only, modern (6.16+/7, adapter, you run generate). |
| Files not imported (fonts, templates) | `additionalFiles({ files })` (`/extensions/core`) | Set `legacyDevProcessCwdBehaviour: false`. |
| npm CLIs (wrangler) | `additionalPackages` (`/extensions/core`) | Pin the version; deploy-only. |
| Decorators (TypeORM/Nest) | `emitDecoratorMetadata()` (`/extensions/typescript`) | TypeScript 7 also needs `@typescript/typescript6`. |

- **Machines:**
  - Default `small-1x` (0.5 vCPU / 0.5 GB). Presets run up to `large-2x` (8 vCPU / 16 GB), all with a 10 GB disk.
  - `retry.outOfMemory.machine` retries once on a bigger machine.
  - A per-trigger `machine` override suits known-large inputs.
- **Pitfalls:** most extensions are **no-ops in `dev`** (you install the tools locally); `@trigger.dev/build` must be a devDependency at the same version as the SDK.
- **Docs:** [config/extensions/overview](https://trigger.dev/docs/config/extensions/overview) · [machines](https://trigger.dev/docs/machines) · [config/config-file#external](https://trigger.dev/docs/config/config-file#external) · per-extension pages

### A8. Webhook-driven automation (`webhook-driven`)
- **You're building:** "when Stripe sends X, do Y", GitHub events, provider callbacks.
- **Two paths:**
  1. **Works everywhere:** your own HTTP route verifies the signature, then calls `tasks.trigger(…, { idempotencyKey: event.id })`, and returns 2xx quickly.
  2. **Beta (hosted webhooks):**
     - `webhooks.endpoint.define({ id, source })`. Trigger.dev hosts the URL and does verification, provider handshakes, dedup, deliveries, replay, filters and waiters.
     - Subscribers: `webhook()` (task), `chat.event` (session routing into agents), channels (Slack/Linear/custom chat surfaces), waiters.
- **Deciding facts:**
  - Is the org in the beta? Check by asking, or by whether the MCP webhook tools respond.
  - Stateless per event → task; stateful per key → `chat.event`; a reply posted back → channel; an existing run waiting → waiter.
  - "Needs secret" on an endpoint means every delivery is rejected.
- **Pitfalls:**
  - Filters aren't security (a throwing filter still routes).
  - Custom sources without `idempotencyField` dedup weakly.
  - Event types are compile-time only, so validate at runtime.
- **Docs:** [webhooks/overview](https://trigger.dev/docs/webhooks/overview) (Beta) · [webhooks/connect](https://trigger.dev/docs/webhooks/connect) · [webhooks/deliveries](https://trigger.dev/docs/webhooks/deliveries) · [idempotency](https://trigger.dev/docs/idempotency)

### A9. Polyglot caller: Python / Go / Ruby backend (`polyglot-caller`)
- **You're building:** Trigger.dev tasks driven by a non-TS backend.
- **Primitives:**
  - Tasks live in a TS package (e.g. `trigger/` with its own `package.json` and `trigger.config.ts`).
  - The backend calls the REST API: `POST https://api.trigger.dev/api/v1/tasks/{taskIdentifier}/trigger` with `Authorization: Bearer <secret key>` and options including `idempotencyKey`. Batch, runs, schedules, waitpoints and sessions have REST endpoints too.
  - Self-host: use `TRIGGER_API_URL` as the base.
  - Preview branches: the `x-trigger-branch` header.
  - Python logic *inside* tasks: `pythonExtension` (A7).
- **Pitfalls:** hard-coding the cloud URL; no idempotency key on retried HTTP calls; the secret key committed in backend config.
- **Docs:** [management/overview](https://trigger.dev/docs/management/overview) · [management/tasks/trigger](https://trigger.dev/docs/management/tasks/trigger) · [management/authentication](https://trigger.dev/docs/management/authentication) · [apikeys](https://trigger.dev/docs/apikeys)

### A10. AI pipeline, not chat (`ai-pipeline`)
- **You're building:** summarise / classify / extract / generate over documents; multi-step LLM workflows; agents without a chat UI.
- **Primitives:**
  - Tasks with AI SDK calls.
  - `streams.define` to stream tokens to a UI.
  - `schemaTask` + `ai.toolExecute(task)` to expose a task as an LLM tool.
  - `prompts.define` for versioned prompts with dashboard overrides.
  - `experimental_telemetry` for spans plus TRQL `llm_metrics` for cost.
  - Retries + idempotency for side-effecting tool calls.
  - Machines as needed.
- **Pitfalls:** retries re-run LLM calls and side effects (use provider idempotency keys); prompt overrides change prod behaviour without a deploy; AI SDK 7 needs `@ai-sdk/otel`.
- **Docs:** [ai/prompts](https://trigger.dev/docs/ai/prompts) · [ai/observability](https://trigger.dev/docs/ai/observability) · [tasks/streams](https://trigger.dev/docs/tasks/streams) · [tasks/schemaTask](https://trigger.dev/docs/tasks/schemaTask)

### A11. Cost-sensitive workloads (`cost-sensitive`)
- **Levers, in order:**
  1. Smallest machine that works, plus per-trigger overrides and `retry.outOfMemory`.
  2. `AbortTaskRunError` and fewer attempts for permanent failures.
  3. Debounce bursty triggers (`maxDelay`).
  4. Idempotency to skip duplicate work.
  5. Waits/tokens instead of polling (and waits ≥ 60 s if concurrency matters).
  6. Realistic `maxDuration`.
  7. Do more work per run when floods of tiny runs dominate (per-run invocation cost).
  8. Billing limits and alerts (dashboard, human).
- **Evidence first:** `audit --focus cost --live` uses TRQL `compute_cost` / `usage_duration` per task and `process.memory.usage`.
- **Docs:** [how-to-reduce-your-spend](https://trigger.dev/docs/how-to-reduce-your-spend) · [machines](https://trigger.dev/docs/machines) · [run-usage](https://trigger.dev/docs/run-usage) · [observability/query](https://trigger.dev/docs/observability/query) · [billing-limits](https://trigger.dev/docs/billing-limits) (Cloud)

### A12. Migration v2/v3 → v4 (`migrate-v2-v3`)
- **Facts:**
  - v3 is retired on Cloud. Self-host 4.5.0 is the last version that runs v3.
  - Upgrade with `npx trigger.dev@latest update`.
  - Up to 2× concurrency while the old engine drains; static IPs may change.
- **Mechanical changes:**
  - `@trigger.dev/sdk/v3` → `@trigger.dev/sdk`.
  - `handleError` → `catchError`; `init` → middleware + `locals`.
  - `toolTask` → `schemaTask` + `ai.toolExecute`.
  - Hooks take one object argument; `onStart` → `onStartAttempt`.
  - On-demand queues removed; `batchTrigger().runs` → `batch.retrieve`.
  - `ctx.attempt.id/status` and `ctx.task.exportName` removed.
  - Raw-string idempotency keys became run-scoped at 4.3.1.
  - Zod ≥ 3.25.56; OTEL exporters 0.203.
- **Docs:** [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) · [upgrading-packages](https://trigger.dev/docs/upgrading-packages) · [troubleshooting-zod](https://trigger.dev/docs/troubleshooting-zod)

### A13. Deploy, CI and environments (`deploy-ci`)
- **Environments:**
  - dev (local `trigger dev`).
  - **dev branches**: `trigger dev --branch` / `TRIGGER_DEV_BRANCH`, for parallel worktrees and agents.
  - staging.
  - **preview branches**: `deploy --env preview`, needs a preview key plus `TRIGGER_PREVIEW_BRANCH`; Cloud, plan-gated.
  - prod.
- **Pipelines:**
  - Manual CLI.
  - GitHub Actions: `TRIGGER_ACCESS_TOKEN` per environment; deploy via the devDependency script; `--external-id` from the sha (PRs: head sha); preview workflows need `closed`.
  - GitHub integration (Cloud): config path when there's more than one config; `TRIGGER_BUILD_*` vars; pre-build command.
  - Vercel integration (Cloud): needs the GitHub integration; remove `syncVercelEnvVars`; automatic skew protection.
- **Env vars:** dashboard (secret status is permanent), CLI `env` (defaults to prod), `syncEnvVars` at deploy (no-op in dev), Infisical native sync. `deploy --env-file` only hydrates the CLI process.
- **Version skew (≥ 4.5.12):**
  - `deploy --external-id` + app-side `TRIGGER_EXTERNAL_DEPLOYMENT_ID`.
  - Pinned runs wait for their deployment and expire after 1 h if it never lands.
  - Traps: `paths:` filters, a stale `TRIGGER_VERSION` (422 on every trigger), two apps sharing one project.
- **Promote / rollback:** `promote <version>`.
- **Private networking:** AWS PrivateLink; Pro/Enterprise; Cloud.
- **Docs:** [deployment/overview](https://trigger.dev/docs/deployment/overview) · [github-actions](https://trigger.dev/docs/github-actions) · [github-integration](https://trigger.dev/docs/github-integration) · [vercel-integration](https://trigger.dev/docs/vercel-integration) · [deployment/preview-branches](https://trigger.dev/docs/deployment/preview-branches) · [deployment/dev-branches](https://trigger.dev/docs/deployment/dev-branches) · [deployment/atomic-deployment](https://trigger.dev/docs/deployment/atomic-deployment) · [deploy-environment-variables](https://trigger.dev/docs/deploy-environment-variables) · [private-networking/overview](https://trigger.dev/docs/private-networking/overview)

### A14. AI chat agent (routed to the `chat-agent` skill)
- **You're building:** a durable multi-turn assistant that survives refreshes, deploys, idle gaps and crashes.
- **Mental model:**
  - Three parts: the agent task (`chat.agent`, the turn loop), a durable **Session** (`.in`/`.out` streams keyed on `chatId`, outliving runs), and the frontend **transport** (`useTriggerChatTransport` → `useChat`).
  - A run suspends after `idleTimeoutInSeconds` (30 s default) and resumes the same process.
  - Continuation runs boot cold and fire `onBoot`.
- **Choose the layer:** `chat.agent` (default) · `chat.createSession` (own per-turn code, no hooks/actions/approvals/Head Start) · `chat.customAgent` + primitives (custom protocol) · raw `sessions` (not chat-shaped).
- **Callers:** browser (React transport) · server/Slack/script/another agent (`AgentChat`) · non-React or non-TS clients (client protocol over REST/SSE) · Slack/Linear/channels (Beta).
- **Persistence:** platform snapshot (default; self-host needs `OBJECT_STORE_*`) · `storage: TranscriptStorage` (your DB is the source of truth; `runTranscriptStorageTests`) · `hydrateMessages` is deprecated.
- **Playbooks:** `greenfield` · `migrate-route-handler` · `persistence` · `approvals-and-questions` · `server-and-channel-callers` · `fast-first-reply` · `long-conversations` · `resilience` · `sub-agents-tools-sandbox` · `test-verify-ship`.
- **Since:** SDK ≥ 4.5.0 (GA July 2026); AI SDK 5/6/7 (approvals need 6+).
- **Docs:** [ai-chat/overview](https://trigger.dev/docs/ai-chat/overview) · [ai-chat/anatomy](https://trigger.dev/docs/ai-chat/anatomy) · [ai-chat/backend](https://trigger.dev/docs/ai-chat/backend) · [ai-chat/frontend](https://trigger.dev/docs/ai-chat/frontend) · [ai-chat/reference](https://trigger.dev/docs/ai-chat/reference)

---

## Part B — Primitive reference

Columns: **Solves** (user goal) · **Reach for when** · **Avoid when** · **Common mistakes** · **Related** · **Doc**.

### B1. Tasks and triggering
| Primitive | Solves | Reach for when | Avoid when | Common mistakes | Related | Doc |
|---|---|---|---|---|---|---|
| `task()` | Durable, retryable background work | Anything slow/flaky/long | Sub-second inline work | Duplicate ids; non-serialisable returns; assuming inheritance | schemaTask, hooks | [tasks/overview](https://trigger.dev/docs/tasks/overview) |
| `schemaTask()` | Runtime payload validation | Untrusted or external payloads | Typed internal calls only | Expecting `tasks.trigger` to validate; custom parser that only casts | `ai.toolExecute` | [tasks/schemaTask](https://trigger.dev/docs/tasks/schemaTask) |
| `tasks.trigger` / `yourTask.trigger` | Start a run | App code / other tasks | — | Value-importing tasks into app bundles; not awaiting | REST trigger | [triggering](https://trigger.dev/docs/triggering) |
| `triggerAndWait` / `batchTriggerAndWait` | Child result inside a task | Parent needs output | Outside tasks (throws) | `Promise.all`; using the Result as output | `batch.*` | [triggering](https://trigger.dev/docs/triggering) |
| `batchTrigger` | Many runs cheaply | > a few items | — | `.runs` (v4 removed); > 1,000 items | rate limits | [limits](https://trigger.dev/docs/limits#batch-trigger-rate-limits) |
| `delay` / `ttl` | Run later / expire stale runs | One-off future work; time-sensitive work | Recurring (use schedules) | `ttl` as a timestamp; TTL counts from enqueue | schedules | [triggering](https://trigger.dev/docs/triggering), [runs#time-to-live-ttl](https://trigger.dev/docs/runs#time-to-live-ttl) |
| `debounce` | Collapse bursts | Bursty events per key | Exact duplicates (idempotency) | No `maxDelay` (unbounded postponement) | idempotency | [triggering](https://trigger.dev/docs/triggering) |
| hidden tasks | Internal tasks | Reusable packages | — | Assuming export is required | — | [hidden-tasks](https://trigger.dev/docs/hidden-tasks) |
| REST trigger | Non-TS callers | Python/Go/Ruby/etc. | TS apps (use SDK) | Hard-coded base URL | management API | [management/tasks/trigger](https://trigger.dev/docs/management/tasks/trigger) |

### B2. Reliability
| Primitive | Solves | Reach for when | Avoid when | Common mistakes | Related | Doc |
|---|---|---|---|---|---|---|
| retries / `catchError` / `AbortTaskRunError` / `retry.fetch` | Transient vs permanent failures | External APIs, rate limits | Non-idempotent side effects without keys | Swallowing errors (run shows Completed); aborting on transient errors | idempotency | [errors-retrying](https://trigger.dev/docs/errors-retrying) |
| idempotency keys | One run per logical event | Retryable parents, webhooks, payments, double clicks | Expecting payload-based dedup | Random keys; raw string expecting global (≥4.3.1 run-scoped); same key across tasks | provider keys | [idempotency](https://trigger.dev/docs/idempotency) |
| `maxDuration` | Runaway protection | LLM loops, unbounded processing | Bounding wall-clock (it's CPU time) | Missing default; < 5 s; cleanup skipped on timeout | timeout.None | [runs/max-duration](https://trigger.dev/docs/runs/max-duration) |
| heartbeats | Avoid `TASK_RUN_STALLED_EXECUTING` | Tight sync CPU loops | — | No `heartbeats.yield()` | machines | [runs/heartbeats](https://trigger.dev/docs/runs/heartbeats) |
| machines | CPU/memory headroom | CPU/memory-bound work | I/O-bound work | Big machines for API calls; no OOM fallback | `retry.outOfMemory` | [machines](https://trigger.dev/docs/machines) |
| versioning | Code stability per run | Understanding replays/children | — | Assuming `trigger()` children match the parent version | atomic deploy | [versioning](https://trigger.dev/docs/versioning) |
| lifecycle hooks / middleware / locals | Shared setup, cleanup, monitoring | DB clients, global error reporting | — | v3 positional signatures; `onFailure` for crash cleanup (it doesn't fire) | init.ts | [tasks/overview](https://trigger.dev/docs/tasks/overview) |

### B3. Concurrency and queues
| Primitive | Solves | Reach for when | Avoid when | Common mistakes | Doc |
|---|---|---|---|---|---|
| `concurrency: { total, perKey }` | Cap one task / per tenant | External API limits, fairness | — | `perKey` without `total` | [concurrency](https://trigger.dev/docs/concurrency) |
| `concurrencyLimit({ name })` | Cap across tasks | Shared resource | — | > 2 named limits per task | [concurrency](https://trigger.dev/docs/concurrency) |
| `queue({ name })` | Shared FIFO ordering | Interleave tasks in one order | Only need a cap | On-demand queues at trigger time (removed); `limit/` names | [queues](https://trigger.dev/docs/queues) |
| `concurrencyKey` | Per-tenant pools | Multi-tenant SaaS | — | Expecting it without `perKey` | [concurrency#concurrency-keys-and-per-tenant-limits](https://trigger.dev/docs/concurrency#concurrency-keys-and-per-tenant-limits) |
| `priority` | Dequeue order within your queue | Premium vs free | Cross-org fairness | Treating it as a hard priority | [runs/priority](https://trigger.dev/docs/runs/priority) |
| `concurrencyLimits.*` / `queues.*` (SDK) | Runtime override/pause | Incidents, scaling | — | Overrides silently expire (7 d default) | [concurrency#managing-concurrency-limits-with-the-sdk](https://trigger.dev/docs/concurrency#managing-concurrency-limits-with-the-sdk) |

### B4. Waits and human-in-the-loop
| Primitive | Solves | Avoid when | Common mistakes | Doc |
|---|---|---|---|---|
| `wait.for/until` | Durable time pauses | External events | < 60 s in loops (holds slot) | [wait](https://trigger.dev/docs/wait) |
| waitpoint tokens | Humans / external callbacks | Typed per-run input (input streams) | No timeout; browser hitting `token.url` | [wait-for-token](https://trigger.dev/docs/wait-for-token) |
| input streams (≥4.4.2) | Send typed data into a running task | Durable channels that outlive the run (sessions) | Old SDK; payload > 1 MB | [tasks/streams](https://trigger.dev/docs/tasks/streams) |
| webhook waiters (Beta) | Wait for a provider event | Org not in the beta | Created after the action | [webhooks/waiters](https://trigger.dev/docs/webhooks/waiters) |

### B5. Observability and operations
| Primitive | Solves | Reach for when | Common mistakes | Doc |
|---|---|---|---|---|
| `logger` / `logger.trace` / OTEL metrics | Structured logs and spans | Every task | Huge attributes (dropped) | [logging](https://trigger.dev/docs/logging) |
| metadata | Live state per run | Progress, status | Arrays/strings at top level; > 256 KB; expecting inheritance | [runs/metadata](https://trigger.dev/docs/runs/metadata) |
| tags | Filter / subscribe / scope tokens | Per-user/tenant views | > 10 tags; PII in tags; not passing to children | [tags](https://trigger.dev/docs/tags) |
| run usage | Cost per run/tenant | Billing users, profiling | — | [run-usage](https://trigger.dev/docs/run-usage) |
| TRQL query | Questions over runs/metrics/LLM | Failure rates, p95, cost, memory, 429s | Title-case status values; plan lookback clipping | [observability/query](https://trigger.dev/docs/observability/query) |
| health report | Deterministic Flow/Execution/Liveness verdict | "Is prod healthy?" | Wrong env (MCP default dev, CLI default prod) | [reports](https://trigger.dev/docs/reports) |
| dashboards | Saved widgets | Team visibility | Plan limits | [observability/dashboards](https://trigger.dev/docs/observability/dashboards) |
| alerts | Run fails / deploy / error groups | Production | Error-group alert goes quiet while Unresolved (dashboard-only setup) | [troubleshooting-alerts](https://trigger.dev/docs/troubleshooting-alerts) |
| replay / bulk actions | Re-run after a fix | Incidents | Bulk filter defaults to the last 7 days | [replaying](https://trigger.dev/docs/replaying), [runs/bulk-actions](https://trigger.dev/docs/runs/bulk-actions) |
| run tests | Manual test runs | Dashboard testing | No sidebar page any more (Tasks page) | [run-tests](https://trigger.dev/docs/run-tests) |

### B6. Realtime and streams
| Primitive | Solves | Avoid when | Common mistakes | Doc |
|---|---|---|---|---|
| public access token | Read/subscribe from the browser | Triggering | No scopes; `runs: true` | [realtime/auth](https://trigger.dev/docs/realtime/auth) |
| trigger token | Trigger from the browser | Reading | Passing a read token instead | [realtime/auth#trigger-tokens-for-frontend-triggering-only](https://trigger.dev/docs/realtime/auth#trigger-tokens-for-frontend-triggering-only) |
| `useRealtimeRun` / `RunsWithTag` / `Batch` | Live run state in React | One-time fetches (SWR) | No `skipColumns`; subscribing before the handle exists | [realtime/react-hooks/subscribe](https://trigger.dev/docs/realtime/react-hooks/subscribe) |
| `useRealtimeStream` | Live tokens/chunks | Small state (metadata) | Not persisting `lastEventId` for reloads | [realtime/react-hooks/streams](https://trigger.dev/docs/realtime/react-hooks/streams) |
| `useTaskTrigger` / `useRealtimeTaskTrigger` | Browser "Run" buttons | — | Read token | [realtime/react-hooks/triggering](https://trigger.dev/docs/realtime/react-hooks/triggering) |
| SWR `useRun` | One-time fetch | Live state | Polling | [realtime/react-hooks/swr](https://trigger.dev/docs/realtime/react-hooks/swr) |
| backend subscribe | Server reacts to run state | — | Tag/batch loops without `break` | [realtime/backend/subscribe](https://trigger.dev/docs/realtime/backend/subscribe) |
| streams v2 (`streams.define`) | Continuous data out of a run | Small state | Direct keys; empty stream across long waits | [tasks/streams](https://trigger.dev/docs/tasks/streams) |

### B7. Configuration
| Field | Decide by | Doc |
|---|---|---|
| `project` | Project ref (dashboard) or `TRIGGER_PROJECT_REF` | [config/config-file](https://trigger.dev/docs/config/config-file) |
| `dirs` / `ignorePatterns` | Where tasks live (optional, auto-detects `trigger`) | same |
| `runtime` | Reproducibility (`node-24`) vs floating `node`; `bun` experimental | same |
| `machine`, `maxDuration`, `retries`, `ttl` | Defaults for all tasks (`maxDuration` must be set) | same, [runs/max-duration](https://trigger.dev/docs/runs/max-duration) |
| `build.extensions` / `external` / `conditions` / `jsx` | Dependencies and build quirks | [config/extensions/overview](https://trigger.dev/docs/config/extensions/overview) |
| `telemetry` | Exporters/instrumentations (not via `OTEL_*`) | [config/config-file](https://trigger.dev/docs/config/config-file) |
| `processKeepAlive` | Cold-start reduction (no guarantee) | same |
| `extraCACerts` | Self-signed TLS (self-host) | same |

### B8. AI chat primitives (detail lives in the `chat-agent` playbooks)
| Primitive | Solves | Key facts | Doc |
|---|---|---|---|
| managed `streamText` (run argument) | Compaction, steering, injection, prompts, telemetry wiring | Imported `streamText` silently loses all of it | [ai-chat/backend](https://trigger.dev/docs/ai-chat/backend#the-managed-streamtext) |
| lifecycle hooks | Per-turn persistence, boot state, recovery | `onBoot` every fresh worker; `onChatStart` once per chat; `onTurnComplete` fires on errors | [ai-chat/lifecycle-hooks](https://trigger.dev/docs/ai-chat/lifecycle-hooks) |
| tools on the config | `toModelOutput` across turns | Declare on `chat.agent({ tools })` and pass back | [ai-chat/tools](https://trigger.dev/docs/ai-chat/tools) |
| transport + two server actions | Browser chat | Ownership check in both; `startSession` forwards `clientData` | [ai-chat/frontend](https://trigger.dev/docs/ai-chat/frontend) |
| `AgentChat` | Server/Slack/script/agent callers | Deterministic `id` to resume | [ai-chat/server-chat](https://trigger.dev/docs/ai-chat/server-chat) |
| sessions / side channels | Durable bi-directional I/O; out-of-band data | `.in` reads need a secret key; ~1 MiB records | [ai-chat/sessions](https://trigger.dev/docs/ai-chat/sessions), [ai-chat/side-channels](https://trigger.dev/docs/ai-chat/side-channels) |
| transcript storage | Chat history in your DB | No tenant check in `createLoadTranscriptAction`; roll forward only | [ai-chat/transcript-storage](https://trigger.dev/docs/ai-chat/transcript-storage) |
| compaction / prompt caching / native compaction | Long conversations, cost | Don't override `prepareStep` after a spread; stable cached prefix | [ai-chat/compaction](https://trigger.dev/docs/ai-chat/compaction), [ai-chat/prompt-caching](https://trigger.dev/docs/ai-chat/prompt-caching) |
| pending messages / background injection / actions | Steering, async context, undo/edit | `deferBeforeOutput` for message writes; `return chat.turn()` | [ai-chat/pending-messages](https://trigger.dev/docs/ai-chat/pending-messages), [ai-chat/background-injection](https://trigger.dev/docs/ai-chat/background-injection), [ai-chat/actions](https://trigger.dev/docs/ai-chat/actions) |
| Preload / Head Start | Slow first reply | Pick one; schema-only tools in the route; serverless `maxDuration` | [ai-chat/fast-starts](https://trigger.dev/docs/ai-chat/fast-starts) |
| recovery boot / OOM / large payloads / version upgrades | Crashes, OOM, 1 MiB cap, deploys | `oomMachine`; idempotent tools; ID references; pinned sessions follow deploys | [ai-chat/patterns/recovery-boot](https://trigger.dev/docs/ai-chat/patterns/recovery-boot), [ai-chat/patterns/oom-resilience](https://trigger.dev/docs/ai-chat/patterns/oom-resilience), [ai-chat/patterns/large-payloads](https://trigger.dev/docs/ai-chat/patterns/large-payloads), [ai-chat/patterns/version-upgrades](https://trigger.dev/docs/ai-chat/patterns/version-upgrades) |
| HITL | Questions and approvals | No `execute` for questions; `needsApproval` + `execute` for approvals (AI SDK 6+) | [ai-chat/patterns/human-in-the-loop](https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop) |
| sub-agents / skills / sandbox | Delegation, bundled capabilities, code execution | `toModelOutput` compression; per-session concurrency; dispose in `onChatSuspend` | [ai-chat/patterns/sub-agents](https://trigger.dev/docs/ai-chat/patterns/sub-agents), [ai-chat/patterns/skills](https://trigger.dev/docs/ai-chat/patterns/skills), [ai-chat/patterns/code-sandbox](https://trigger.dev/docs/ai-chat/patterns/code-sandbox) |
| testing / MCP chat | Offline tests; live smoke test | Import the harness first; `await harness.close()` | [ai-chat/testing](https://trigger.dev/docs/ai-chat/testing), [ai-chat/mcp](https://trigger.dev/docs/ai-chat/mcp) |
| trusted edge signals | Anti-abuse signals | Never from browser `clientData` | [ai-chat/patterns/trusted-edge-signals](https://trigger.dev/docs/ai-chat/patterns/trusted-edge-signals) |

### B9. Webhooks (Beta) — see A8 and [webhooks/overview](https://trigger.dev/docs/webhooks/overview), [webhooks/sources](https://trigger.dev/docs/webhooks/sources), [webhooks/filters](https://trigger.dev/docs/webhooks/filters), [webhooks/session-routing](https://trigger.dev/docs/webhooks/session-routing), [webhooks/channels](https://trigger.dev/docs/webhooks/channels), [webhooks/slack](https://trigger.dev/docs/webhooks/slack), [webhooks/linear](https://trigger.dev/docs/webhooks/linear), [webhooks/human-in-the-loop](https://trigger.dev/docs/webhooks/human-in-the-loop).

### B10. Key limits that change decisions (numbers in `references/limits.md`, each with URL)
- Payload ≤ 3 MB (auto-offload over 128 KB from 4.5.0); output ≤ 10 MB.
- Batch ≤ 1,000 items; API 1,500 req/min.
- Metadata 256 KB; tags 10 per run (≤ 128 chars).
- Idempotency TTL 30 days; key ≤ 2,048 chars.
- `maxDuration` ≥ 5 s; heartbeat stall after 5 min.
- Checkpoint at 60 s.
- Max TTL 14 d (Cloud); dev run TTL 10 min.
- Stream retention 28 d, 300 MiB per stream.
- Chat records ~1 MiB.
- Plan-dependent: environment concurrency, queue sizes, schedules, preview branches, realtime connections, log retention, query lookback.

Source: [limits](https://trigger.dev/docs/limits).

## Sources
All links above. In addition: https://trigger.dev/docs/llms.txt (index used to confirm page existence).
