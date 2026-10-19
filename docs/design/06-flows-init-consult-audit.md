# 06 — Flows: init, consult, audit (+ new, diagnose, ship) and the rule catalog

This file defines the three core flows the brief asks for (init, consult, audit) in enough detail to implement. It also defines the three supporting flows that make them complete (`new`, `diagnose`, `ship`) and the full audit rule catalog with the linter decision.

Every flow starts from the **fingerprint**: either injected at session start by H1, or produced on demand by `trigger-ctx detect` ([05](05-steering-and-hooks.md), [04 §5](04-plugin-architecture.md)).

---

## 1. Init — `/trigger-dev:init [goal]`

**Shape.** User-invoked skill (`disable-model-invocation: true`). Setup has side effects (packages, files, cloud project, login), so the user decides when it runs.

Frontmatter (illustrative):
```yaml
---
name: init
description: Set up Trigger.dev in this repository with a short discovery, an explicit architecture decision, and a first task proven to run.
argument-hint: "[what you want Trigger.dev to run first]"
disable-model-invocation: true
allowed-tools: Bash(trigger-ctx *) Bash(npx trigger.dev@latest *) Bash(pnpm dlx trigger.dev@latest *) Bash(yarn dlx trigger.dev@latest *) Bash(bunx trigger.dev@latest *)
---
## Project facts
!`trigger-ctx detect --brief || true`
```
`trigger-ctx` always exits 0 and the `|| true` stays as a belt and braces. A failed `` !`…` `` injection aborts the whole skill ([Claude Code skills](https://code.claude.com/docs/en/skills)).

### 1.1 Stages

| Stage | What happens | Primitive used | Human gate |
|---|---|---|---|
| 0 Detect | Read the fingerprint, then branch:<br>• already set up → offer `new` or `audit`<br>• v2/v3 → `migrate-v2-v3` card<br>• no Node/npx → explain REST-only mode and stop<br>• none → continue | injected `trigger-ctx detect` | — |
| 1 Intent | One AskUserQuestion (≤ 4 options). Skipped if `$ARGUMENTS` states the goal. | AskUserQuestion | answer |
| 2 Architecture questions | One AskUserQuestion call with only the unanswered questions (§1.2). Chat → `chat-agent` discovery (§1.4). | AskUserQuestion + `build` cards | answer |
| 3 Decision record | ≤ 15 lines: primitives, one-line why, doc link per primitive, files to create. | text | confirm |
| 4a Auth | `whoami` (MCP `whoami` or CLI). If logged out: `trigger.dev login --email <e> --name <n> --no-browser --no-wait` → give the URL to the user → after they confirm, `trigger.dev login --no-browser`. Never create an account for them. | CLI | **yes** (browser approval, email verification) |
| 4b Project | `list_projects`/`projects list` → choose, or create (`projects create --org --name` / MCP `create_project_in_org`). | MCP/CLI | **yes** (creates a cloud resource) |
| 4c Install + config | `init -y --project-ref <ref> --runtime node-24 [--pkg-args …]` from the right package directory (monorepo/polyglot aware). Manual branch when a config already exists or tasks go into a new `trigger/` subpackage. | CLI | — |
| 4d Config patch | `defineConfig` from `@trigger.dev/sdk`; `dirs`; default `maxDuration`; extensions with correct import paths; pinned `runtime`; `.trigger` in `.gitignore`; config in tsconfig `include`. | Edit | — |
| 4e Secret key | `TRIGGER_SECRET_KEY` from the dashboard API keys page. Restricted presets only on Pro/Enterprise; Free/Hobby/self-host use an unrestricted key. | text | **yes** (dashboard) |
| 4f First task + call site | Task shaped by the scenario card. Call site: type-only `tasks.trigger` in TS, or a REST snippet with an idempotency key in the host language. | Edit, `templates/` | — |
| 5 Prove it runs | MCP `start_dev_server` → `dev_server_status` ready → `get_current_worker` lists the task → `trigger_task` (env dev) → `wait_for_run_to_complete` → show status/output + dashboard link. In a linked git worktree use `trigger dev --branch <name>` via Bash instead. | MCP / CLI | — |
| 6 Hand-off | What exists; next steps (`new` for UI/realtime, `ship` for deploy). Optional 5-line pointer in CLAUDE.md/AGENTS.md (ask). | text | consent for the pointer |

Failure in stage 5: Phase 1 shows `get_run_details` plus the matching `references/link-index.md` symptom row. From Phase 2 it hands off to `diagnose`.

### 1.2 Discovery question tree

AskUserQuestion constraints shape the tree: 1–4 questions per call, 2–4 options each, "Other" always available. The tree uses **at most two calls**: intent, then architecture. Each question has a skip rule. When a question is skipped, the agent states the inferred answer in the decision record so the user can correct it.

| Q | Question → options | Decides | Skip when (infer from the repo) |
|---|---|---|---|
| Q1 | *What will Trigger.dev run first?* → Background or scheduled jobs · Long workflow with waits/approvals · AI chat agent · Reacting to webhooks/events | Scenario card(s) | `$ARGUMENTS` or the conversation states it |
| Q2 | *Where does the work start?* → My app's backend · A schedule · The browser · An external service's webhook | SDK vs REST call site; trigger tokens; webhook path (own route vs Beta) | Implied by Q1 (schedule), or the backend language is detected and the user said "from my API" |
| Q3 | *Does a user need to see progress or results live?* → No · Status/progress bar · Streamed text (LLM output) | Realtime: metadata vs streams; token route; `@trigger.dev/react-hooks` | **No frontend detected** (no react/vue/svelte/next/remix deps) → "No"; or Q1 = chat agent (the transport handles it) |
| Q4 | *Does it need more than Node?* → No · Headless browser · ffmpeg/media · Python or system packages | Build extensions + machine preset | Deps answer it: `puppeteer`/`playwright` → browser; `fluent-ffmpeg` or ffmpeg spawn → media; `*.py` beside tasks or `@trigger.dev/python` → Python; `sharp`/`prisma` → handled without asking |
| Q5 | *How much volume, and any limits?* → Low · Bursts from many users · Large batches (1k+) · A rate-limited external API | Queues, `concurrency.perKey`, batch API, debounce, idempotency | `$ARGUMENTS` mentions volume. For a single scheduled or background job, default to "Low" and state the assumption. |
| Q6 (only if Q1 = long workflow) | *What does it wait for?* → Fixed time · A person's approval · An external callback · Another task's result | `wait.for` vs waitpoint token vs webhook waiter (Beta) vs `triggerAndWait` | Q1 free text already says |

Questions **not asked at init**, because they belong to `ship`: CI system, preview branches, Vercel/GitHub integration, environment-variable source. Plan tier is asked only when a recommendation depends on it (schedules more frequent than hourly, preview branches, restricted API keys, private networking).

### 1.3 Answers → architecture

| Answer | Primitives chosen (card) | Files touched | Docs cited in the decision record |
|---|---|---|---|
| Q1 jobs + Q2 backend (TS) | `task`/`schemaTask`, `tasks.trigger` type-only, retries, idempotency key (A1) | `trigger/<name>.ts`, call site | tasks/overview, triggering, idempotency |
| Q1 jobs + Q2 backend (Python/Go/Ruby) | TS subpackage + REST trigger (A9) | `trigger/package.json`, `trigger/trigger.config.ts`, `trigger/src/…`, REST snippet in the host language | management/tasks/trigger, apikeys |
| Q2 schedule | `schedules.task` declarative cron with timezone; `ttl` if overlap is possible (A2) | task file | tasks/scheduled |
| Q3 status | `metadata` + `useRealtimeRun` + read-token route (A6) | task, token route, client component | runs/metadata, realtime/auth, realtime/react-hooks/subscribe |
| Q3 streamed text | `streams.define` + `useRealtimeStream` (A6) | stream definition, component | tasks/streams, realtime/react-hooks/streams |
| Q2 browser | trigger token + `useTaskTrigger` (A6) | token route, component | realtime/auth#trigger-tokens-for-frontend-triggering-only |
| Q2 webhook | own route + `idempotencyKey: event.id`; Beta hosted webhooks only if confirmed (A8) | route, task | webhooks/overview (Beta), idempotency |
| Q4 browser/media/Python | extension(s) + machine + dev install note (A7) | `trigger.config.ts` | per-extension pages, machines |
| Q5 bursts | `concurrency: { total, perKey }` + `concurrencyKey` (A3) | task | concurrency |
| Q5 batches | `batchTrigger(AndWait)` in ≤ 1,000 chunks (A3) | parent task | triggering, limits |
| Q5 rate-limited API | named `concurrencyLimit` + `retry.fetch` with 429 strategy + debounce (A3) | tasks | concurrency, errors-retrying |
| Q6 approval / callback | waitpoint token (+ `useWaitToken`) / webhook waiter (A5) | task, completion route/UI | wait-for-token, webhooks/waiters |
| Q1 chat agent | `chat-agent` discovery (§1.4) | see playbooks | ai-chat/quick-start |

### 1.4 Chat-agent discovery (the `chat-agent` skill, also reached from init)

| # | Question (ask only if not inferable) | Why it changes the architecture | Infer from |
|---|---|---|---|
| C1 | Migrating an existing chat route, or new? | migrate playbook vs greenfield | `app/api/chat/route.ts`, `streamText` + `toUIMessageStreamResponse`, `resumable-stream`, `useChat` |
| C2 | Who talks to the agent: browser, Slack/Linear, other servers/agents? | transport vs `AgentChat` vs channels (Beta) | `@slack/*`, webhook routes, a frontend present |
| C3 | Must chat history live in your database (list, search, edit, branch, audit)? | platform snapshot vs `storage: TranscriptStorage` | prisma/drizzle schema with chat tables |
| C4 | Do any tools have side effects that need approval? | `needsApproval` (AI SDK ≥ 6), idempotent tools | an existing tools map; `ai` major version |
| C5 | How do you authenticate users and own chats? | ownership checks in both token actions (mandatory) | next-auth/clerk/lucia/supabase deps |
| C6 | Is first-reply latency important? | Preload vs Head Start vs neither | warm server route, serverless host |
| C7 | Long conversations or very large tool outputs? | compaction, prompt caching, ID references (~1 MiB cap) | domain (RAG, code, files) |
| C8 | Cloud or self-hosted? | `baseURL`; `OBJECT_STORE_*` needed for snapshots | fingerprint |

Inferred without asking: frontend framework (React only for the transport hook; others use the client protocol), AI SDK major, provider packages, SDK ≥ 4.5.0 (otherwise update first), deploy host.

---

## 2. New — `/trigger-dev:new <capability>`

`new` adds one capability to an existing Trigger.dev project, ending in a proven run. It reuses init stages 1–3 and 4f–5 and skips setup. It exists because "add X" is a procedure with side effects and a verification step, while `build` answers questions. Typical arguments: "progress bar for the import task", "nightly cleanup", "approval step before refund", "Slack agent".

---

## 3. Consult — `build` (auto) or `/trigger-dev:build <question>`

Protocol (top of `build/SKILL.md`, after the invariants):
1. **Anchor.** Use the fingerprint in context, or run `trigger-ctx detect --brief`.
2. **Classify.** How-to (API detail) · design ("should I / what's best") · symptom → hand to `diagnose` · cost → `cost-sensitive` card or `/trigger-dev:audit --focus cost` · deploy/CI → `deploy-ci` card · chat agent → `chat-agent`.
3. **Pick the card.** Read only that card (≤ 500 words).
4. **Ask or assume.** Ask ≤ 2 questions, and only if the answer changes the primitive. Otherwise state the assumption in one line.
5. **Verify** API names and signatures with the 3-tier lookup: `trigger-ctx docs <topic>` → local pinned `.mdx` (if the SDK is installed) → MCP `search_docs` → web `.md`. Then apply the version gate (`since` vs installed SDK).
6. **Answer in the bridge format:**

```
You're building <X>. <Primitive Y> fits because <Z> (and not <W>, because …).
Minimal shape: <≤15 lines, version-checked>
Watch out for: <≤3 pitfalls>
Docs: <local pinned path> · <https://trigger.dev/docs/...>
```

Example (progress UI): "You're building a page that shows import progress. Store progress in run **metadata** (`metadata.set("progress", n)`) and subscribe with **`useRealtimeRun`**: metadata is for small state, which is what a progress bar is. Use streams only for continuous output like LLM tokens. Mint a **read-scoped public token** for that run on the server. Watch out for: no scopes = no access; add `skipColumns: ["payload","output"]`; metadata over 256 KB is silently rejected. Docs: node_modules/@trigger.dev/sdk/docs/realtime/react-hooks/subscribe.mdx · https://trigger.dev/docs/realtime/react-hooks/subscribe"

Never paste doc prose. Never assert an API without step 5. If the docs disagree with each other, cite the conservative reading and name the conflict ([02 §2](02-official-skills-audit.md), `references/link-index.md`).

---

## 4. Audit — `/trigger-dev:audit [path] [--focus cost|chat|realtime|deploy] [--live] [--fix]`

### 4.1 Pipeline (pattern adapted from plugin-swiftui's `audit-scan.py` → domain auditors → `_SUMMARY.md`)
1. **Scan.** `trigger-ctx scan <root> --json` reports relevance per domain, then tier-1 hits. Tier-2 ast-grep runs if available, with a notice when degraded.

| Domain | Relevance signal |
|---|---|
| tasks | any `@trigger.dev/sdk` import in `dirs` |
| schedules | `schedules.` |
| realtime/frontend | `@trigger.dev/react-hooks`, `auth.create*Token` |
| chat | `@trigger.dev/sdk/ai`, `chat.agent`, `useTriggerChatTransport` |
| webhooks | `webhooks.`, `chat.event`, provider routes calling `tasks.trigger` |
| config/build | `trigger.config.*` |
| deploy/CI | `.github/workflows/*trigger*`, `vercel.json`, deploy scripts |
| cost | always, as a light pass |

2. **Static report** printed immediately: deterministic rules with their hits.
3. **Parallel `code-auditor` agents**, one per relevant domain (≤ 4 concurrently; the command picks them from the scan). Each:
   - reads every hit in context (**the engine locates, it never judges**)
   - drops false positives
   - evaluates the domain's judgment rules
   - returns findings JSON
4. **Live layer** (`--live`; MCP connected; user agrees):
   - `get_report` per environment (explicit env)
   - TRQL for failure rate, retry counts, p95 `usage_duration`, `compute_cost` per task, `process.memory.usage`, 429 denials
   - `get_current_worker` for schedules and machine presets

   This attaches evidence to COST/OPS rules and raises or lowers severity.
5. **Report.** `trigger-audit/REPORT.md` + `trigger-audit/findings.json` (or stdout only if the user prefers). Each finding carries: rule id, severity, confidence, file:line, evidence snippet, fact (why it's wrong), fix, doc URL, `fix_mode`. Summary: counts by severity and domain, top 5 fixes by impact.
6. **Fix** (`--fix`, only if asked):
   - Clean-tree gate (dirty tree → findings only).
   - Findings are written before any fix.
   - Only `fix_mode: auto` rules are applied.
   - One commit per rule family; re-scan to verify.
   - Never weaken a check to make findings disappear.

### 4.2 Linter decision

**Yes, the plugin ships a deterministic linter.** It is the `lint`/`scan` mode of `trigger-ctx`: zero-dependency Node ≥ 18, rules as data in `scripts/rules/rules.json`.

Why a linter at all:
- The highest-cost mistakes are silent: no error, wrong behaviour. Examples: imported `streamText`, `Promise.all` around waits, unchecked Results, scope-less tokens.
- They are textually recognisable.
- The model skips prose after compaction; a check doesn't.

Two tiers:
- **Tier 1, always on:** regex plus a small scanner that strips comments and strings and can balance brackets. Covers "`Promise.all(` whose argument contains `triggerAndWait`" and "`schedules.create(` call whose argument object lacks `deduplicationKey`". Runs on files that won't even parse.
- **Tier 2, audits only, optional:** ast-grep for containment and scope rules. Same detection as plugin-swiftui: native binary → `sg` → `npx --package @ast-grep/cli ast-grep`; degrade with a notice.

Rules:
- **Hook tier:** 14 rules with ≥ 95% precision, each gated by `applies_when` (e.g. `sdk>=4`) so valid v3 code in v3 projects is never flagged.
- Everything else is **audit tier**: located by the engine, judged by an agent.

What the linter doesn't do: no type checking, no build, no network (except `--live`, which goes through MCP).

Rule format (one entry):
```json
{
  "id": "TSK-01",
  "severity": "error",
  "tier": "hook",
  "scope": "task-code",
  "applies_when": "sdk>=4",
  "match": { "type": "call-containing", "callee": "Promise.(all|allSettled|race)", "contains": "(\\.triggerAndWait\\(|\\.batchTriggerAndWait\\(|batch\\.triggerAndWait\\(|wait\\.(for|until|forToken)\\(|retry\\.onThrow\\()" },
  "message": "Waits and triggerAndWait can't run in parallel inside a task (\"Parallel waits are not supported\").",
  "fix": "Use batchTriggerAndWait / batch.triggerAndWait for fan-out, or a sequential loop.",
  "fix_mode": "flag-only",
  "doc": "https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported",
  "since": null
}
```

Hook output shape (H2, facts not imperatives):
```
Trigger.dev tripwire (1 hit):
- src/trigger/import.ts:42 — Promise.all wraps childTask.triggerAndWait; waits can't run in parallel in a task → use childTask.batchTriggerAndWait([...]) (https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported)
```

### 4.3 Rule catalog

Severity: **E** error (broken or unsafe) · **W** warning (likely wrong or costly) · **I** info.
Detection: **S** script · **S+J** script locates, agent confirms · **J** judgment · **L** live data.
★ = hook tier (H2). `fix_mode` is `auto` only where marked **(auto)**; everything else is flag-only.

#### MIG — stale APIs and migration
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| ★MIG-01 | W | S | `@trigger.dev/sdk/v3` import when SDK ≥ 4 ("still works, will be removed") | import from `@trigger.dev/sdk` **(auto)** | [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) |
| ★MIG-02 | E | S | v2 API: `defineJob(`, `eventTrigger(` | rewrite as `task()` | [introduction](https://trigger.dev/docs/introduction) |
| MIG-03 | W | S | `handleError`, `init:`, `cleanup:`, `toolTask`, `ai.tool(`, `metadata.stream(`, `onStart:` | `catchError`; middleware + locals; `schemaTask` + `ai.toolExecute`; streams; `onStartAttempt` | [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) |
| ★MIG-04 | W | S | positional hook args `(payload, { ctx })` in hooks (SDK ≥ 4) | single object argument **(auto)** | [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) |
| ★MIG-05 | W | S | `ctx.attempt.id`, `ctx.attempt.status`, `ctx.task.exportName` (SDK ≥ 4) | `ctx.attempt.number` / remove | [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) |
| ★MIG-06 | E | S | `.batchTrigger(…)` result `.runs` (SDK ≥ 4) | `batch.retrieve(handle.batchId)` | [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) |
| ★MIG-07 | E | S | `defineConfig` imported from a non-existent path (`@trigger.dev/sdk/build`, `@trigger.dev/build`) | `import { defineConfig } from "@trigger.dev/sdk"` **(auto)** | [config/config-file](https://trigger.dev/docs/config/config-file) |
| MIG-08 | E | S | `trigger.dev` / `@trigger.dev/*` versions differ across package.json files, or any 3.x | align versions; `npx trigger.dev@latest update` | [github-actions](https://trigger.dev/docs/github-actions), [upgrading-packages](https://trigger.dev/docs/upgrading-packages) |
| MIG-09 | W | S | Zod < 3.25.56 or an override pinning it; `instanceof z.ZodError` | upgrade; `.issues`; `zod/v4` for composed schemas | [troubleshooting-zod](https://trigger.dev/docs/troubleshooting-zod) |
| MIG-10 | I | S | `runtime` unset or `"node"` (floats with LTS) | pin `node-24` when reproducibility matters | [config/config-file](https://trigger.dev/docs/config/config-file) |
| MIG-11 | W | S | OTEL exporters 0.52.x with SDK 4; exporters configured via `OTEL_*` env | 0.203.x; constructor args | [config/config-file](https://trigger.dev/docs/config/config-file) |

Version gates (`applies_when`):
- MIG-01, MIG-04, MIG-05, MIG-06 carry `sdk>=4`, so valid v3 code in v3 projects stays silent.
- MIG-02 applies to every version: v2 is end-of-life, so flagging it is the point.
- MIG-07 applies to every version: those import paths never existed.

#### TSK — task authoring and reliability
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| ★TSK-01 | E | S | `Promise.all/allSettled/race` containing `triggerAndWait`, `batchTriggerAndWait`, `wait.*`, `retry.onThrow` | batch APIs or a sequential loop | [troubleshooting](https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported) |
| TSK-02 | E | S+J | `triggerAndWait` result's `.output` used without `.ok` or `.unwrap()` | check `ok` / `unwrap()` | [triggering](https://trigger.dev/docs/triggering) |
| TSK-03 | E | S | `trigger()`/`batchTrigger()` not awaited/returned inside a task | `await` | [troubleshooting](https://trigger.dev/docs/troubleshooting#when-triggering-subtasks-the-parent-task-finishes-too-soon) |
| TSK-04 | E | S | `*AndWait` / `wait.*` outside task dirs (route handlers) | move into a task; `tasks.trigger` from the app | [triggering](https://trigger.dev/docs/triggering) |
| TSK-05 | W | S | `.trigger(` inside `for`/`while`/`.map`/`forEach` | `batchTrigger` | [limits](https://trigger.dev/docs/limits#rate-limits) |
| TSK-06 | W | S+J | literal batch > 1,000; `batchTrigger` without `BatchTriggerError` handling | chunk; back off on `isRateLimited` | [limits](https://trigger.dev/docs/limits#batch-trigger-rate-limits) |
| TSK-07 | E | S | `await import(` of task modules then `.trigger` | top-level import or `tasks.trigger("id")` | [troubleshooting](https://trigger.dev/docs/troubleshooting#could_not_find_executor) |
| TSK-08 | W | J | `catch` in `run()` that logs and returns (run shows Completed) | rethrow or `AbortTaskRunError` | [errors-retrying](https://trigger.dev/docs/errors-retrying) |
| TSK-09 | I | J | `AbortTaskRunError` on transient errors / plain `Error` on permanent ones | choose by retryability; `catchError` | [errors-retrying](https://trigger.dev/docs/errors-retrying) |
| TSK-10 | W | J | payment/email/charge calls in `run()` without a provider idempotency key | key from `ctx.run.id` or a business id | [idempotency](https://trigger.dev/docs/idempotency) |
| TSK-11 | W | S | `idempotencyKey:` from `randomUUID`/`uuid`/`nanoid`/`Date.now`/`Math.random` | stable business id | [idempotency](https://trigger.dev/docs/idempotency) |
| TSK-12 | W | J | raw-string key inside a task expecting once-ever | `idempotencyKeys.create(k, { scope: "global" })` | [idempotency](https://trigger.dev/docs/idempotency) |
| TSK-13 | W | S+J | sync CPU-heavy loop without `heartbeats.yield()` | yield, worker thread or bigger machine | [runs/heartbeats](https://trigger.dev/docs/runs/heartbeats) |
| TSK-14 | W | S | `setTimeout`/`setInterval`/sleep inside `run()` for long delays | `wait.for` | [wait](https://trigger.dev/docs/wait) |
| TSK-15 | I | S | `wait.for` < 60 s inside a polling loop (holds the slot) | ≥ 60 s or waitpoint tokens | [concurrency](https://trigger.dev/docs/concurrency#short-time-based-waits-keep-their-slot) |
| TSK-16 | W | S | no default `maxDuration` in config (docs conflict → W) | add a default; `timeout.None` explicitly where intended | [runs/max-duration](https://trigger.dev/docs/runs/max-duration) |
| TSK-17 | E | S | `maxDuration` < 5 | ≥ 5 | [runs/max-duration](https://trigger.dev/docs/runs/max-duration) |
| TSK-18 | I | J | critical cleanup only in `cleanup`/`onSuccess`/`onFailure` on tight `maxDuration` (skipped on timeout) | idempotent cleanup elsewhere | [runs/max-duration](https://trigger.dev/docs/runs/max-duration#maxduration-and-lifecycle-functions) |
| TSK-19 | W | J | buffers/base64/whole files in payloads; outputs > 10 MB | pass references | [limits](https://trigger.dev/docs/limits#task-payloads-and-outputs) |
| TSK-20 | W | S+J | metadata top-level array/string; unbounded `append` (256 KB, silent 413) | object; bound or store elsewhere | [runs/metadata](https://trigger.dev/docs/runs/metadata) |
| TSK-21 | W | J | child expects parent tags/metadata/limits | pass explicitly (`metadata.current()`, `ctx.run.tags`) | [runs/metadata](https://trigger.dev/docs/runs/metadata), [tags](https://trigger.dev/docs/tags) |
| TSK-22 | W | S | > 10 tags or tag > 128 chars | trim | [tags](https://trigger.dev/docs/tags) |
| TSK-23 | W | S | `debounce` without `maxDelay` (E with `triggerAndWait`); `delay >= maxDelay` | set `maxDelay > delay` | [triggering](https://trigger.dev/docs/triggering) |
| TSK-24 | W | S | `createClient(`/`new Pool(`/`new Kafka(`/`MongoClient` in tasks without `.on("error")` | add a listener | [troubleshooting](https://trigger.dev/docs/troubleshooting#uncaught-exceptions) |
| TSK-25 | E | S | `NestFactory.createApplicationContext` in a task | don't boot Nest in tasks | [troubleshooting](https://trigger.dev/docs/troubleshooting) |
| TSK-26 | E | S | duplicate task `id` literals | unique ids | [tasks/overview](https://trigger.dev/docs/tasks/overview) |
| TSK-27 | W | S | task definitions outside `dirs`; `dirs` entries that don't exist | fix `dirs` | [config/config-file](https://trigger.dev/docs/config/config-file) |
| TSK-28 | W | S | `runs.list(` in a loop or before triggers (coordination/polling) | idempotency, waits, realtime | [runs/list-best-practices](https://trigger.dev/docs/runs/list-best-practices) |
| TSK-29 | I | J | memory-heavy task on default machine without `retry.outOfMemory` | machine or OOM retry | [machines](https://trigger.dev/docs/machines) |
| TSK-30 | I | J | stream opened then a ≥ 1 h wait with no writes | close first or heartbeat chunks | [tasks/streams](https://trigger.dev/docs/tasks/streams) |

#### QUE — queues and concurrency
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| QUE-01 | I | S | `queue: { concurrencyLimit }`, `queues.overrideConcurrencyLimit/resetConcurrencyLimit` | `concurrency: { total, perKey }`, `concurrencyLimits.*` | [concurrency](https://trigger.dev/docs/concurrency) |
| QUE-02 | E | S | queue object `{ name, concurrencyLimit }` in trigger options | predeclare `queue()`; reference by name | [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) |
| QUE-03 | E | S | trigger-time `queue: "x"` not declared by any task → PENDING_VERSION | declare `queue({ name: "x" })` on a task | [troubleshooting](https://trigger.dev/docs/troubleshooting#runs-stuck-in-pending-version) |
| QUE-04 | W | S | `concurrency: { perKey }` without `total` | add `total` | [concurrency](https://trigger.dev/docs/concurrency#per-key-and-total-limits-together) |
| QUE-05 | W | J | fan-out to a rate-limited API with no cap | `concurrency.total` / named `concurrencyLimit` | [concurrency](https://trigger.dev/docs/concurrency) |
| QUE-06 | E | S | queue name `limit/…` or > 128 chars | rename | [queues](https://trigger.dev/docs/queues) |

#### SCH — schedules
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| ★SCH-01 | E | S | `schedules.create(` without `deduplicationKey` | add a per-environment key | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled), [limits](https://trigger.dev/docs/limits#schedules) |
| ★SCH-02 | E | S | cron pattern with 6 fields | 5 fields | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) |
| SCH-03 | W | S+J | string cron (UTC) for business-local times | `{ pattern, timezone }` | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) |
| SCH-04 | W | J | same dedup key across environments (key is per project) | include env name | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) |
| SCH-05 | I | J | run time can exceed the interval, no `ttl` | `ttl` | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) |
| SCH-06 | I | S | more often than hourly (Cloud Free rejects) | hourly or paid plan | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) |
| SCH-07 | I | J | `schedules.task` with no cron and no `schedules.create` | attach a schedule | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) |

#### RT — realtime, frontend, auth
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| ★RT-01 | E | S | secret literal `tr_(dev|stg|prod|preview|pat)_…` in any non-`.env*` text file; `TRIGGER_SECRET_KEY` in a `"use client"` file; `NEXT_PUBLIC_`/`VITE_`/`REACT_APP_` + TRIGGER + SECRET | move to server env; rotate the key | [apikeys](https://trigger.dev/docs/apikeys) |
| ★RT-02 | E | S | `createPublicToken()` with no scopes (W `runs: true`; E expiry > 30 d; W `multipleUse: true`) | scope to runs/tags/batch | [realtime/auth](https://trigger.dev/docs/realtime/auth) |
| RT-03 | E | J | `useTaskTrigger`/`useRealtimeTaskTrigger` fed a read token | `auth.createTriggerPublicToken` | [realtime/auth](https://trigger.dev/docs/realtime/auth#trigger-tokens-for-frontend-triggering-only) |
| RT-04 | W | S | file using `@trigger.dev/react-hooks` without `"use client"` (App Router) | add directive | [realtime/react-hooks/subscribe](https://trigger.dev/docs/realtime/react-hooks/subscribe) |
| RT-05 | W | S | `useRun(` with `refreshInterval > 0` | `useRealtimeRun` | [realtime/react-hooks/swr](https://trigger.dev/docs/realtime/react-hooks/swr) |
| RT-06 | I | J | status-only component without `skipColumns` | `skipColumns: ["payload","output"]` | [realtime/react-hooks/subscribe](https://trigger.dev/docs/realtime/react-hooks/subscribe) |
| RT-07 | I | J | hook given `handle?.id` without `enabled` | `enabled: !!handle` | [realtime/react-hooks/triggering](https://trigger.dev/docs/realtime/react-hooks/triggering) |
| RT-08 | W | J | `subscribeToRunsWithTag`/`subscribeToBatch` loop without `break` | break on condition | [realtime/backend/subscribe](https://trigger.dev/docs/realtime/backend/subscribe) |
| RT-09 | W | S | client code fetching `token.url` | `useWaitToken` / CORS complete endpoint | [wait-for-token](https://trigger.dev/docs/wait-for-token) |
| RT-10 | I | S | `wait.createToken` without `timeout` | add timeout | [wait-for-token](https://trigger.dev/docs/wait-for-token) |
| RT-11 | I | S | literal `https://api.trigger.dev` base URL in app code | env-driven `baseURL`/`TRIGGER_API_URL` | [apikeys](https://trigger.dev/docs/apikeys) |
| RT-12 | W | S | value import of task modules into app/client code | `import type` + `tasks.trigger` | [triggering](https://trigger.dev/docs/triggering) |

#### CHT — chat agents
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| ★CHT-01 | E | S | `streamText` imported from `"ai"` used in a `chat.agent` run without `...chat.toStreamTextOptions()` | destructure `streamText` from the run argument | [ai-chat/backend](https://trigger.dev/docs/ai-chat/backend#the-managed-streamtext) |
| CHT-02 | W | S | `streamText(` in `run` without `abortSignal` | `abortSignal: signal` | [ai-chat/backend](https://trigger.dev/docs/ai-chat/backend) |
| CHT-03 | W | S | tools (with `toModelOutput`) passed only at the call site | declare on `chat.agent({ tools })` | [ai-chat/tools](https://trigger.dev/docs/ai-chat/tools) |
| ★CHT-04 | E | S | `.init(` on a `chat.local` in `onChatStart`/`onPreload` | init in `onBoot` | [ai-chat/lifecycle-hooks](https://trigger.dev/docs/ai-chat/lifecycle-hooks#onboot) |
| CHT-05 | E | S+J | `createStartSessionAction` / token action without an auth + ownership check | authorise `chatId` in both actions | [ai-chat/quick-start](https://trigger.dev/docs/ai-chat/quick-start) |
| CHT-06 | E | S | `chat.createAccessToken`, `getStartToken`, transport `triggerConfig`/`triggerOptions`, `transport.preload(id, opts)` | current two-callback transport; config in `createStartSessionAction` | [ai-chat/upgrade-guide](https://trigger.dev/docs/ai-chat/upgrade-guide) |
| CHT-07 | W | S | transport without `startSession`, or wrapper dropping `clientData` | add / forward params | [ai-chat/frontend](https://trigger.dev/docs/ai-chat/frontend) |
| CHT-08 | E/W | S | `storage` + `hydrateMessages` together (E); new `hydrateMessages` (W) | `storage: TranscriptStorage` | [ai-chat/migrating-from-hydrate-messages](https://trigger.dev/docs/ai-chat/migrating-from-hydrate-messages) |
| CHT-09 | W | S | `chat.defer(` wrapping a message write in `onTurnStart` | `chat.deferBeforeOutput` (or `await` if read back) | [ai-chat/background-injection](https://trigger.dev/docs/ai-chat/background-injection#chat-deferbeforeoutput) |
| CHT-10 | E | S | `prepareStep` after `...chat.toStreamTextOptions()` in an agent with compaction/pending messages | managed `streamText` composes it | [ai-chat/compaction](https://trigger.dev/docs/ai-chat/compaction) |
| ★CHT-11 | E | S | `onAction` returns `streamText(…)`, a string or a UIMessage | `return chat.turn()` | [ai-chat/actions](https://trigger.dev/docs/ai-chat/actions#answering-after-an-action) |
| CHT-12 | E | S | `export const x = chat.createLoadTranscriptAction(` with no wrapper | wrap with ownership check | [ai-chat/transcript-storage](https://trigger.dev/docs/ai-chat/transcript-storage#reading-the-transcript) |
| CHT-13 | W | J | messages and `lastEventId` written in separate awaits | one transaction | [ai-chat/patterns/database-persistence](https://trigger.dev/docs/ai-chat/patterns/database-persistence) |
| CHT-14 | W | S | `chat.agent(` without `uiMessageStreamOptions.onError` | sanitise errors | [ai-chat/error-handling](https://trigger.dev/docs/ai-chat/error-handling) |
| CHT-15 | W | S+J | Head Start route importing heavy tool executes; body parser before `toNodeListener`; no serverless `maxDuration` | schema-only tools module; scope the parser; set `maxDuration` | [ai-chat/fast-starts](https://trigger.dev/docs/ai-chat/fast-starts#head-start) |
| CHT-16 | W | S+J | question tool with `execute`; `addToolOutput` without `sendAutomaticallyWhen`; `needsApproval` on `ai@5` | per HITL pattern | [ai-chat/patterns/human-in-the-loop](https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop) |
| CHT-17 | W | J | tool outputs that can exceed ~1 MiB (`ChatChunkTooLargeError`) | persist + emit an id | [ai-chat/patterns/large-payloads](https://trigger.dev/docs/ai-chat/patterns/large-payloads) |
| CHT-18 | W | J | side-effecting tools without idempotency (OOM retry / regenerate) | provider idempotency keys | [ai-chat/patterns/oom-resilience](https://trigger.dev/docs/ai-chat/patterns/oom-resilience) |
| CHT-19 | E/W | S | statements after `await chat.endAndContinue()` (E); `lockToVersion` with `requestUpgrade` (W) | return immediately; use external deployment id | [ai-chat/patterns/version-upgrades](https://trigger.dev/docs/ai-chat/patterns/version-upgrades) |
| CHT-20 | E | J | self-host without `OBJECT_STORE_*` and no `storage` (continuations boot empty) | configure store or BYO storage | [ai-chat/patterns/persistence-and-replay](https://trigger.dev/docs/ai-chat/patterns/persistence-and-replay) |
| CHT-21 | W | S | `ai@7` without `@ai-sdk/otel` | install | [ai-chat/reference](https://trigger.dev/docs/ai-chat/reference) |
| CHT-22 | W | S | `Date`/`toISOString`/`randomUUID` inside a cached system prompt | move dynamic data to injection | [ai-chat/prompt-caching](https://trigger.dev/docs/ai-chat/prompt-caching) |
| CHT-23 | E | J | `clientData` used for authorisation; trust signals from the browser | derive server-side; edge proxy | [ai-chat/patterns/trusted-edge-signals](https://trigger.dev/docs/ai-chat/patterns/trusted-edge-signals) |
| CHT-24 | W | S | leftover chat route, `resumable-stream`, `convertToModelMessages` inside `run` | delete per migration guide | [ai-chat/migrating-from-a-route-handler](https://trigger.dev/docs/ai-chat/migrating-from-a-route-handler) |
| CHT-25 | I | S | test imports agent before `@trigger.dev/sdk/ai/test`; harness not closed | import order; `try/finally close()` | [ai-chat/testing](https://trigger.dev/docs/ai-chat/testing) |

#### WH — webhooks (Beta-gated except WH-06)
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| WH-01 | E | J | waiter created after the provider call | create first | [webhooks/waiters](https://trigger.dev/docs/webhooks/waiters) |
| WH-02 | W | S | waiter without `idempotencyKey`; `webhooks.custom` without `idempotencyField` | add keys | [webhooks/deliveries](https://trigger.dev/docs/webhooks/deliveries#deduplication) |
| WH-03 | E | L | endpoint "Needs secret" (MCP `list_webhook_endpoints`) | set/generate secret | [webhooks/connect](https://trigger.dev/docs/webhooks/connect) |
| WH-04 | W | J | handler trusts `event` shape without runtime validation | validate | [webhooks/filters](https://trigger.dev/docs/webhooks/filters) |
| WH-05 | W | S | exported `chat.event` not listed on any agent; same key on two agents | list it; prefix keys | [webhooks/session-routing](https://trigger.dev/docs/webhooks/session-routing) |
| WH-06 | W | J | own webhook route → `tasks.trigger` without the provider event id as `idempotencyKey` | add key | [idempotency](https://trigger.dev/docs/idempotency) |

#### CFG — config and build
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| CFG-01 | E | S | `puppeteer`/`playwright` `.launch(` without the extension (`.connect` = remote, OK; Bun + remote = E) | add extension; `runtime: "node"` for remote | [config/extensions/puppeteer](https://trigger.dev/docs/config/extensions/puppeteer), [config/extensions/playwright](https://trigger.dev/docs/config/extensions/playwright) |
| CFG-02 | E | S | Prisma without `prismaExtension`; no `mode`; mode ↔ generator mismatch; missing generate step for modern/engine-only; `migrate` outside legacy | per decision table | [config/extensions/prismaExtension](https://trigger.dev/docs/config/extensions/prismaExtension) |
| CFG-03 | E | S | ffmpeg spawn/`fluent-ffmpeg` without `ffmpeg()`; `fluent-ffmpeg` not in `build.external` | add both | [config/extensions/ffmpeg](https://trigger.dev/docs/config/extensions/ffmpeg) |
| CFG-04 | E | S | Python without `pythonExtension`; scripts not globbed; both requirement options; extension imported from `@trigger.dev/build` | fix per page | [config/extensions/pythonExtension](https://trigger.dev/docs/config/extensions/pythonExtension) |
| CFG-05 | W | S | `sharp`/`re2`/`sqlite3`/WASM not in `build.external` (unless auto-detected) | add to external | [config/config-file](https://trigger.dev/docs/config/config-file#external) |
| CFG-06 | W | S+J | decorators/TypeORM/Nest without `emitDecoratorMetadata()` | add extension + `typescript` devDep | [config/extensions/emitDecoratorMetadata](https://trigger.dev/docs/config/extensions/emitDecoratorMetadata) |
| CFG-07 | W | J | non-JS assets read at runtime not in `additionalFiles` | add; `legacyDevProcessCwdBehaviour: false` | [config/extensions/additionalFiles](https://trigger.dev/docs/config/extensions/additionalFiles) |
| CFG-08 | I | S | `.trigger` not in `.gitignore`; config not in tsconfig `include` | add **(auto)** | [manual-setup](https://trigger.dev/docs/manual-setup) |
| CFG-09 | W | S | `@trigger.dev/build` missing or not a devDependency | move | [config/extensions/overview](https://trigger.dev/docs/config/extensions/overview) |
| CFG-10 | E | S | `extraCACerts` not starting with `./` | fix path | [config/config-file](https://trigger.dev/docs/config/config-file) |
| CFG-11 | W | S | `additionalPackages` entry without a version | pin | [config/extensions/additionalPackages](https://trigger.dev/docs/config/extensions/additionalPackages) |
| CFG-12 | E | S | secret literals in `trigger.config.*` or `syncEnvVars` | `process.env` / secret store | [config/extensions/syncEnvVars](https://trigger.dev/docs/config/extensions/syncEnvVars) |

#### DEP — deploy, CI, environments
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| DEP-01 | E | S | workflow runs a deploy without `TRIGGER_ACCESS_TOKEN` (or only `TRIGGER_SECRET_KEY`) | add per-env token secret | [github-actions](https://trigger.dev/docs/github-actions) |
| DEP-02 | W | S | one token secret for all environments | one per env | [github-actions](https://trigger.dev/docs/github-actions) |
| DEP-03 | E | S | `--env preview` workflow without `closed` in `pull_request.types` | add `closed` | [deployment/preview-branches](https://trigger.dev/docs/deployment/preview-branches) |
| DEP-04 | W | S | PR workflow uses `${{ github.sha }}` as external id | `github.event.pull_request.head.sha` | [github-actions](https://trigger.dev/docs/github-actions) |
| DEP-05 | E | S | `paths:` filter combined with sha-based external id | derive id from last commit touching tasks | [deployment/atomic-deployment](https://trigger.dev/docs/deployment/atomic-deployment) |
| DEP-06 | E | S | `TRIGGER_VERSION` set in app/hosting env | remove after skew protection is verified | [deployment/atomic-deployment](https://trigger.dev/docs/deployment/atomic-deployment) |
| DEP-07 | W | S | `syncVercelEnvVars(` with the Vercel integration | remove | [vercel-integration](https://trigger.dev/docs/vercel-integration) |
| DEP-08 | W | J+L | `process.env.X` in tasks absent from target env (`env list --env`) | `env set` / sync | [deploy-environment-variables](https://trigger.dev/docs/deploy-environment-variables) |
| DEP-09 | W | S | `deploy --env-file` used as if it set task env | it only hydrates the CLI | [cli-deploy-commands](https://trigger.dev/docs/cli-deploy-commands) |
| DEP-10 | W | S | package.json deploy/env scripts without explicit `--env` | add `--env` | [cli-deploy-commands](https://trigger.dev/docs/cli-deploy-commands) |
| DEP-11 | W | S | preview key (`tr_preview_`) used without `TRIGGER_PREVIEW_BRANCH` | set it | [deployment/preview-branches](https://trigger.dev/docs/deployment/preview-branches) |
| DEP-12 | W | S | > 1 `trigger.config.*` with the GitHub integration and no config path | set path in integration | [github-integration](https://trigger.dev/docs/github-integration) |
| DEP-13 | E | S | self-host CI deploy without `TRIGGER_API_URL` (and Buildx/registry login) | add | [github-actions](https://trigger.dev/docs/github-actions) |

#### COST — evidence-driven (`--focus cost`, best with `--live`)
| ID | Sev | Det | Rule | Fix | Doc |
|---|---|---|---|---|---|
| COST-01 | W | J+L | large machine on I/O-bound or short runs (TRQL `usage_duration`, memory) | smaller preset; per-trigger override; OOM retry | [how-to-reduce-your-spend](https://trigger.dev/docs/how-to-reduce-your-spend) |
| COST-02 | W | J+L | retries burning compute on permanent errors (`attempt_count`) | `AbortTaskRunError`, fewer attempts | [errors-retrying](https://trigger.dev/docs/errors-retrying) |
| COST-03 | W | J+L | bursty triggers per key, no debounce | `debounce` + `maxDelay` | [triggering](https://trigger.dev/docs/triggering) |
| COST-04 | I | S | short waits holding slots / polling | tokens, ≥ 60 s | [wait](https://trigger.dev/docs/wait) |
| COST-05 | I | J+L | crons more frequent than the data changes | reduce frequency | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) |
| COST-06 | I | L | floods of tiny runs (per-run invocation cost) | do more per run | [how-to-reduce-your-spend](https://trigger.dev/docs/how-to-reduce-your-spend) |
| COST-07 | W | L | no billing limit/alerts configured (Cloud; dashboard) | set them (human) | [billing-limits](https://trigger.dev/docs/billing-limits) |

#### OPS — live (`--live`)
| ID | Sev | Det | Rule | Doc |
|---|---|---|---|---|
| OPS-01 | W/E | L | `get_report` degraded/failing for prod or staging (explicit env) | [reports](https://trigger.dev/docs/reports) |
| OPS-02 | W | L | failure rate or retry storms per task (TRQL `runs`) | [observability/query](https://trigger.dev/docs/observability/query) |
| OPS-03 | W | L | memory near the preset ceiling (TRQL `metrics`) | [machines](https://trigger.dev/docs/machines) |
| OPS-04 | W | L | API 429 denials (`api.rate_limit.denied`) | [observability/query](https://trigger.dev/docs/observability/query#api-rate-limit-metrics) |
| OPS-05 | I | L | no run-failure alert configured (ask; dashboard) | [troubleshooting-alerts](https://trigger.dev/docs/troubleshooting-alerts#which-alert-type-should-i-use) |

**Counts:** MIG 11 · TSK 30 · QUE 6 · SCH 7 · RT 12 · CHT 25 · WH 6 · CFG 12 · DEP 13 · COST 7 · OPS 5 = **134 rules**, 14 of them hook tier.

---

## 5. Diagnose — `diagnose` skill (model + user invocable)

1. Map the symptom to a row in `symptoms.md` (excerpt below; ~35 rows in the skill).
2. Run the **first check** with an explicit environment.
3. A run id or failing task with large logs → spawn `run-investigator`, which returns ≤ 25 lines (verdict, evidence ids, ranked causes, fix, doc).
4. Propose the fix with its doc link.
5. After the fix ships, offer a replay or bulk replay (a write, so it asks).

| Symptom | Likely causes (ranked) | First check | Doc |
|---|---|---|---|
| Runs stuck QUEUED (deployed) | env concurrency saturated; restrictive limit; stalled runs holding slots; paused limit; billing limit; short waits holding slots | MCP `get_report environment=prod`; `concurrencyLimits.retrieve` (SDK) | [troubleshooting](https://trigger.dev/docs/troubleshooting#runs-waiting-in-queue-due-to-concurrency-limits) |
| Runs never start in dev | second `trigger dev` instance (parallel sessions); dev server down; 10-min dev TTL | `dev_server_status`; dev branches | [troubleshooting](https://trigger.dev/docs/troubleshooting#runs-never-dequeue-in-dev) |
| PENDING_VERSION | task/queue not in the deployed version; wrong key env; skew pin not landed | `get_current_worker` (env); `list_deploys` | [troubleshooting](https://trigger.dev/docs/troubleshooting#runs-stuck-in-pending-version) |
| `TASK_RUN_STALLED_EXECUTING` | blocked event loop; dev Ctrl-C; machine too small | `get_run_details` debug; TRQL CPU on run_id | [troubleshooting](https://trigger.dev/docs/troubleshooting#task-run-stalled-executing) |
| Timed out | `maxDuration` too low (CPU time); runaway loop | `get_run_details`; p95 `usage_duration` | [runs/max-duration](https://trigger.dev/docs/runs/max-duration) |
| Crashed / OOM | memory over preset (incl. ffmpeg child) | `get_run_details`; TRQL memory | [machines](https://trigger.dev/docs/machines) |
| `COULD_NOT_FIND_EXECUTOR` | dynamic import of task modules | grep `await import(` | [troubleshooting](https://trigger.dev/docs/troubleshooting#could_not_find_executor) |
| 429 on trigger | trigger in a loop; batch bucket empty; webhook ingest limit | TRQL `api.rate_limit.denied` | [troubleshooting](https://trigger.dev/docs/troubleshooting#rate-limit-exceeded) |
| Runs Expired | TTL passed while queued | `list_runs` status; ttl config | [runs](https://trigger.dev/docs/runs#time-to-live-ttl) |
| Schedule didn't fire / fires late | dev CLI off; not in latest deploy; UTC; free-plan floor; 60-min window | `list_runs` for the schedule | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) |
| Idempotency returned an old run | success/cancel keep the key 30 d; run-scoped since 4.3.1 | `runs.retrieve` returned id | [idempotency](https://trigger.dev/docs/idempotency) |
| "Parallel waits are not supported" | `Promise.all` around waits | grep | [troubleshooting](https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported) |
| Parent finishes before children | unawaited trigger | grep | [troubleshooting](https://trigger.dev/docs/troubleshooting#when-triggering-subtasks-the-parent-task-finishes-too-soon) |
| `TASK_RUN_UNCAUGHT_EXCEPTION` | EventEmitter "error" without listener | `get_run_details` | [troubleshooting](https://trigger.dev/docs/troubleshooting#uncaught-exceptions) |
| Env var not found in deployed run | not set for that env | `env list --env <e>` | [troubleshooting](https://trigger.dev/docs/troubleshooting#environment-variable-not-found) |
| Run Completed but nothing happened | swallowed errors; NestJS filter | code review | [errors-retrying](https://trigger.dev/docs/errors-retrying) |
| Billing limit reached (Cloud) | spend cap | dashboard (human) | [troubleshooting](https://trigger.dev/docs/troubleshooting#runs-queued-because-a-billing-limit-was-reached) |
| Deploy `resource_exhausted` | build infra limits | deploy output | [troubleshooting](https://trigger.dev/docs/troubleshooting#resource_exhausted) |
| `No loader is configured for ".node" files` | native module not external | config | [config/config-file](https://trigger.dev/docs/config/config-file#external) |
| No alert despite failures | only an error-group alert, group Unresolved | dashboard Alerts (human) | [troubleshooting-alerts](https://trigger.dev/docs/troubleshooting-alerts#why-it-goes-quiet) |
| Webhook didn't trigger (Beta) | filtered; secret not set; 429; provider not registered | `list_webhook_deliveries` → `get_webhook_delivery` | [webhooks/deliveries](https://trigger.dev/docs/webhooks/deliveries) |
| Chat: history gone after deploy/crash | no object store (self-host) and no storage | config + env | [ai-chat/patterns/persistence-and-replay](https://trigger.dev/docs/ai-chat/patterns/persistence-and-replay) |
| Chat: first reply slow | cold boot | Preload/Head Start | [ai-chat/fast-starts](https://trigger.dev/docs/ai-chat/fast-starts) |
| Chat: `ChatChunkTooLargeError` | tool output ≥ ~1 MiB | log output sizes | [ai-chat/patterns/large-payloads](https://trigger.dev/docs/ai-chat/patterns/large-payloads) |
| Zod errors after upgrading to 4.6 | Zod < 3.25.56; major mismatch | `npm ls zod` | [troubleshooting-zod](https://trigger.dev/docs/troubleshooting-zod) |

`diagnose/trql.md` holds query *ideas*. The agent writes exact SQL after `get_query_schema`. The ideas:
- failed runs with error (24 h)
- success rate per task per day
- p50/p95 `usage_duration`
- top cost runs and cost per task
- runs by queue × machine
- memory per task (7 d)
- CPU timeline for one run
- 429s per minute
- runs with `attempt_count > 3`
- tenant runs via `has(tags, 'user_…')`
- queue latency (`executed_at - triggered_at`) p95
- metric discovery

Status values are title case in TRQL (`'Failed'`); lookback is clipped by plan (1 d / 7 d / 30 d).

---

## 6. Ship — `/trigger-dev:ship [env]` (reads `build/scenarios/deploy-ci.md`)

1. **Preflight** (`trigger-ctx scan --focus deploy`):
   - MIG-08 versions
   - CFG-01..05 (imports ↔ extensions)
   - DEP-08 env vars present in the target env
   - RT-01/CFG-12 secrets
   - TSK-16 `maxDuration`
   - DEP-09 `--env-file` misbelief
2. **Pipeline** (infer from `.github/workflows`, `vercel.json`; ask once):
   - **manual CLI**
   - **GitHub Actions:**
     - `TRIGGER_ACCESS_TOKEN` per environment ("Deploy only" preset on Pro/Enterprise, otherwise an unrestricted key for that environment)
     - deploy through the devDependency script
     - `--external-id ${{ github.sha }}`; PRs use the head sha
     - preview workflow `types: [opened, synchronize, reopened, closed]`
   - **GitHub integration:** config path if > 1 config; `TRIGGER_BUILD_*`; pre-build command for Prisma generate
   - **Vercel integration:** requires the GitHub integration; remove `syncVercelEnvVars`; automatic skew protection
   - **Preview branches:** integration **or** Actions, never both
3. **Skew protection:**
   - App deployed separately → `TRIGGER_EXTERNAL_DEPLOYMENT_ID` / `configure({ externalDeploymentId })`.
   - Watch for `paths:` filters, two apps sharing a project, and a stale `TRIGGER_VERSION`.
4. **Deploy** with explicit `--env` (H3 asks otherwise):
   - `--dry-run` first when extensions changed.
   - `--native-build` on `resource_exhausted`.
5. **Verify:**
   - `list_deploys`
   - `get_current_worker` in that env
   - optional staging smoke test via `trigger_task` (asks)
   - `get_report --environment <env>`
6. **Rollback** = `promote <previous version>`. Chat transcript format is roll-forward only, so warn when chat agents exist.

**Human gates**, named explicitly: API key creation (shown once), GitHub secret, GitHub App/Vercel OAuth, dashboard build settings, billing limits.

## Sources
https://code.claude.com/docs/en/skills · https://trigger.dev/docs/cli-init-commands · https://trigger.dev/docs/cli-login-commands · https://trigger.dev/docs/mcp-tools · plus every page linked in the tables.
