# 09 — Scenario walkthroughs (stress tests)

Thirteen realistic sessions, varying stack, experience and goal. Each one lists:
- the primitives that fire, in order
- what the agent says (bridge format, abridged)
- the revision it forced (R1–R10), already applied in [04](04-plugin-architecture.md)–[08](08-doc-link-index.md)

Legend: **H1/H2/H3** hooks · **S:** skill · **C:** user command · **A:** agent · **M:** MCP tool · **CLI** · **E:** `trigger-ctx`.

---

## 1. Beginner, Next.js + pnpm: "Add Trigger.dev and send a 3-email welcome sequence, with a progress bar"

| # | What fires | What happens |
|---|---|---|
| 1 | H1 | No Trigger.dev signal yet → silent, no marker. |
| 2 | S: `build` | Loads because the user named Trigger.dev. Classifies "setup + long-workflow-waits + progress-ui" and suggests `/trigger-dev:init` because setup has side effects. |
| 3 | C: `init` | Stage 0 `detect`: pnpm, Next 16 app router, no config. Stage 1 skipped (`$ARGUMENTS` has the goal). Stage 2 asks only Q2 (start: backend) and Q3 (progress: status bar). Q4 skipped (no binaries in deps); Q5 assumed "low" and stated. |
| 4 | — | Decision record: `welcome-sequence` task with `wait.for({ days })` between sends, idempotency key `welcome-${userId}`, `metadata.set("step", n)`, read-scoped public token route, `useRealtimeRun` with `skipColumns`. |
| 5 | CLI | `whoami` fails → `login --no-browser --no-wait` → user approves → `login --no-browser`. Project chosen via `M: list_projects`. `pnpm dlx trigger.dev@latest init -y --project-ref …`. |
| 6 | H2 | The agent writes `auth.createPublicToken()` with no scopes → RT-02 fires; the agent adds `scopes: { read: { runs: [id] } }`. |
| 7 | M | `start_dev_server` → `get_current_worker` → `trigger_task` (dev) → `wait_for_run_to_complete` (first wait is 1 day, so it reports "WAITING, step 1 sent") + dashboard link. |

Agent excerpt: "You're building a multi-day email sequence with a progress bar. A **task with `wait.for`** fits: waits over 60 s release the concurrency slot and you aren't billed while waiting (not a cron per email, because you'd have to track state yourself). Progress goes in **run metadata**, read by **`useRealtimeRun`** through a read-scoped token. Watch out for: send emails with your provider's idempotency key; metadata ≤ 256 KB. Docs: …/wait-for.mdx · https://trigger.dev/docs/wait-for · https://trigger.dev/docs/realtime/react-hooks/subscribe"

**R5:** Q3 is skipped when no frontend is detected, and `build`'s description is scoped to "project uses Trigger.dev or the user names it", so it loads here but not in #12.

## 2. Python/FastAPI team: "Run a 20-minute ML scoring job off our API with Trigger.dev"

| # | What fires | What happens |
|---|---|---|
| 1 | H1 | Pure sh finds `TRIGGER_SECRET_KEY` (name only) in `.env` → marker written, prints the sh subset. No Node on this laptop → no `detect`. |
| 2 | S: `build` | Classifies `polyglot-caller` + `heavy-compute`. Says plainly: tasks are TypeScript and need Node for dev/deploy; Python runs inside the task via `pythonExtension`. |
| 3 | C: `init` (after the user installs Node) | Creates a self-contained `trigger/` package (template 1); `pythonExtension({ scripts: ["./python/**/*.py"], requirementsFile })` imported from `@trigger.dev/python/extension`; machine `large-1x`; `maxDuration` 3600 (CPU seconds). Dev note: extensions are no-ops in dev, so use a local venv. |
| 4 | — | REST call site in FastAPI (template 3): `httpx.post(f"{TRIGGER_API_URL}/api/v1/tasks/score-model/trigger", json={"payload": …, "options": {"idempotencyKey": job_id}}, headers={"Authorization": f"Bearer {key}"})`. |
| 5 | H2 | The agent pastes a `tr_dev_` key into `settings.py` while testing → RT-01 fires on the `.py` file. |

**R1:** H1 detection must be pure sh (no Node, no jq), and RT-01 must cover any text file, not just TS.

## 3. Turborepo with two trigger roots: "Nightly, re-score 50k rows per tenant"

| # | What fires | What happens |
|---|---|---|
| 1 | H1 | Lists `apps/jobs` and `packages/ai` with project refs and `configPath`s. |
| 2 | S: `build` → card `fan-out-batch` + `scheduled-pipeline` | Asks one question: "Does the scoring API have a rate limit?" (yes, 100 rps). |
| 3 | — | `schedules.task` with `{ pattern, timezone }` → parent pages tenants → `batchTrigger` in chunks of ≤ 1,000 → child task with `concurrency: { total: 50, perKey: 5 }`, `concurrencyKey: tenantId`, `idempotencyKey: \`${date}-${rowId}\``. |
| 4 | H2 | The agent's first draft uses `Promise.all(rows.map(r => scoreRow.triggerAndWait(r)))` → TSK-01 fires → rewritten as `scoreRow.batchTriggerAndWait`. |
| 5 | M | `get_current_worker` with `configPath=apps/jobs/trigger.config.ts` (from the fingerprint). |

**R2:** the fingerprint must carry `configPath` + `projectRef` per root, because MCP tools otherwise default to the cwd config.

## 4. Greenfield chat agent: Next.js + Anthropic + Drizzle

| # | What fires | What happens |
|---|---|---|
| 1 | S: `build` → routes to S: `chat-agent` | `build` doesn't hold chat knowledge; it only routes. |
| 2 | S: `chat-agent` discovery | C1 new (inferred) · C2 browser (inferred) · C3 "history in your DB?" → **yes** · C4 "tools with side effects?" → refunds · C5 auth = next-auth (inferred) · C6 skipped · C7 skipped · C8 cloud (inferred). |
| 3 | playbooks `greenfield` → `persistence` → `approvals-and-questions` | Token actions **with an ownership check** (E2 fixed), `storage: TranscriptStorage` with Drizzle + `runTranscriptStorageTests`, refund tool with `needsApproval` (AI SDK 6) and a provider idempotency key. |
| 4 | H2 | `import { streamText } from "ai"` used inside `run` → CHT-01 fires → destructured from the run argument. |
| 5 | playbook `test-verify-ship` | `mockChatAgent` unit test; M: `list_agents` → `start_agent_chat` → `send_agent_message` → `close_agent_chat` in dev. |

**R3:** `build` must route chat to `chat-agent` instead of carrying a mini chat section (that duplication would load in every non-chat session).

## 5. Migrate an existing `useChat` route (Hono API + Vite React)

`chat-agent` → `migrate-route-handler` playbook:
- Token handlers become fetch endpoints (no Next server actions).
- Delete `resumable-stream` and Redis.
- The transport replaces the `/api/chat` call.

C: `audit --focus chat` afterwards: CHT-24 finds a leftover `convertToModelMessages` in `run`; CHT-07 finds the wrapper dropping `clientData`.

Agent excerpt: "You already stream from a route. **`chat.agent`** replaces the route's loop, and the transport replaces resumable streams. You keep `useChat`. You're not on Next.js, so the token actions become two fetch endpoints, and each one checks the user owns `chatId`. Docs: https://trigger.dev/docs/ai-chat/migrating-from-a-route-handler"

No revision; validates the C1/C2 inference rules.

## 6. "Build a Slack support agent that asks a human before refunds"

| # | What fires | What happens |
|---|---|---|
| 1 | S: `chat-agent` | C2 → Slack. The Slack connector and channels are **private beta**. |
| 2 | — | The agent asks: "Do you have webhooks beta access? (check the dashboard or MCP `list_webhook_endpoints`)" → user: no. |
| 3 | playbook `server-and-channel-callers` | No-beta path: the user's own Slack Events handler verifies the signature, then calls `AgentChat` server-side with `chatId = slack thread ts`; approvals via Slack interactive buttons completing a waitpoint token. |
| 4 | — | With beta (documented branch): `slack()` connector + session routing + channel HITL; human steps listed (Slack app, secret via `set_webhook_secret` → H3 always asks). |

**R6:** beta features need an availability question + a non-beta path, never the default.

## 7. On-call: "Prod runs are stuck in QUEUED"

| # | What fires | What happens |
|---|---|---|
| 1 | S: `diagnose` | Symptom row "stuck QUEUED". First check: M: `get_report environment=prod` (explicit: MCP defaults to dev). |
| 2 | A: `run-investigator` | `list_runs status=EXECUTING env=prod` → long-running runs on `sync-inventory`; TRQL CPU timeline for one run → a 40-minute synchronous loop; `TASK_RUN_STALLED_EXECUTING` on others. |
| 3 | verdict (≤ 25 lines) | "Environment concurrency saturated by `sync-inventory` runs that block the event loop; heartbeats stall and runs hold slots. Fix: `await heartbeats.yield()` in the loop, or move work to a worker thread; consider a per-task `concurrency.total`." Docs: https://trigger.dev/docs/runs/heartbeats · https://trigger.dev/docs/troubleshooting#task-run-stalled-executing |
| 4 | after the fix ships | Offers bulk replay of failed runs → M: `replay_run` in prod → H3 asks. |

No revision; validates the explicit-env invariant and agent isolation (the traces were ~40k tokens; the verdict was 22 lines).

## 8. Cost spike: "Our bill doubled this month"

C: `audit --focus cost --live`:
1. `scan` → cost domain.
2. A: `run-investigator` runs TRQL: cost per task, p95 `usage_duration`, memory per task, `attempt_count > 3`.
3. Findings:
   - **COST-01:** `pdf-render` on `large-2x` uses 600 MB → `medium-1x` (~2.5x vs ~20x of the base rate).
   - **COST-02:** `fetch-feed` retries 10x on 404s → `AbortTaskRunError`.
   - **COST-06:** 2M runs of a 50 ms task → batch the work (invocation cost $0.25 per 10k runs).
   - **COST-07:** no billing limit → dashboard (human).
4. Numbers come from the pricing page, not the official skill's wrong table (E4).

No revision; validates evidence-driven COST rules (N13).

## 9. Self-hoster (`login -a https://jobs.internal`)

| # | What fires | What happens |
|---|---|---|
| 1 | H1 | No `TRIGGER_API_URL` in env, but the current CLI profile's URL isn't the default → "target: self-host https://jobs.internal". |
| 2 | S: `build` / C: `ship` | Cloud-only advice dropped: no API-key presets, no Vercel/GitHub integration, no preview-branch plan gating. CI deploy needs `TRIGGER_API_URL` (DEP-13). |
| 3 | S: `chat-agent` | CHT-20: "Self-hosted chat agents need `OBJECT_STORE_*` for snapshots, or use `storage`." |
| 4 | M | All tools work through the profile; REST templates read `TRIGGER_API_URL`. |

**R7:** self-host detection must read the CLI profile, not only `TRIGGER_API_URL`.

## 10. v3 → v4 upgrade

| # | What fires | What happens |
|---|---|---|
| 1 | H1 | "SDK 3.3.x (v3 reaches end of life on Cloud)". |
| 2 | H2 | The agent edits an existing v3 task: MIG-01/04/05/06 are gated `sdk>=4` → **silent** (the code is valid v3). |
| 3 | S: `build` → card `migrate-v2-v3` | Plan: `npx trigger.dev@latest update` → C: `audit --fix`. MIG family `fix_mode: auto` for imports and hook signatures, one commit per family; `ctx.attempt.id` flag-only; QUE-01/02 queue changes; idempotency scope note (4.3.1). |
| 4 | H2 after the upgrade | Now `sdk>=4` → any leftover `/v3` import fires MIG-01. |

**R4:** every MIG hook rule carries `applies_when: sdk>=4`; otherwise v3 projects get a stream of false positives.

## 11. Two Claude Code sessions in git worktrees, both running `trigger dev`

| # | What fires | What happens |
|---|---|---|
| 1 | H1 (session B, linked worktree) | Appends `export TRIGGER_DEV_BRANCH=feature-x` to `CLAUDE_ENV_FILE`; the fingerprint says "worktree feature-x; dev runs isolated on dev branch feature-x". |
| 2 | C: `new` stage 5 | Uses CLI `trigger dev --branch feature-x` in the background (not MCP `start_dev_server`, whose branch support is unverified). |
| 3 | — | Session A's runs no longer get picked up by B's worker. |

**R8:** dev branches must be handled at session start; otherwise the documented "second dev instance splits runs" failure is silent ([deployment/dev-branches](https://trigger.dev/docs/deployment/dev-branches)).

## 12. A Go service with no Trigger.dev (plugin enabled at user scope)

| # | What fires | Cost |
|---|---|---|
| 1 | H1 | one sh spawn, no output, no marker |
| 2 | Edits | H2: one `test -f` each, no output |
| 3 | `go test ./...` | no H3 match |
| 4 | User: "add a nightly cleanup job" | `build` **does not load** (no Trigger.dev context; description excludes it) |
| standing | listing ≈ 450 tokens + deferred MCP names ≈ 250 tokens | **0 at project scope** |

**R9:** recommend project-scope enablement. The acceptance test checks `/mcp` and the context listing in a non-Trigger repo. Negative eval cases guard `build` activation.

## 13. "Set up GitHub Actions so PRs get preview deploys"

| # | What fires | What happens |
|---|---|---|
| 1 | S: `build` → card `deploy-ci` | Model-invoked path, so the user doesn't need to know `/trigger-dev:ship`. |
| 2 | — | Workflow: `on: pull_request: types: [opened, synchronize, reopened, closed]`; `trigger deploy --env preview` on open/sync and `preview archive` on close; `--external-id ${{ github.event.pull_request.head.sha }}`; `TRIGGER_ACCESS_TOKEN` = preview-env key ("Deploy only" preset on Pro/Enterprise, otherwise an unrestricted key for that environment); deploy via the devDependency script. |
| 3 | — | Warns: integration **or** Actions for previews, never both; preview branches depend on plan (Cloud). |
| 4 | C: `ship --env preview` (optional) | Preflight → deploy → `list_preview_branches` → `get_current_worker env=preview branch=…`. |

**R10:** deploy/CI knowledge must be a model-invocable card (`deploy-ci`), with `ship` reading the same card. Otherwise CI questions only get answered when the user knows the command.

---

## Coverage check

| Dimension | Scenarios |
|---|---|
| Stack | Next.js (1, 4, 13), Python (2), Turborepo (3), Hono + Vite (5), Go (12), self-host (9) |
| Experience | beginner (1), team lead (3, 13), on-call (7), platform owner (8, 9) |
| Goal | setup (1, 2), batch (3), chat (4, 5, 6), ops (7, 8), migration (10), parallel dev (11), CI (13), noise (12) |
| Every hook exercised | H1 (1, 2, 3, 9, 10, 11, 12), H2 (1, 2, 3, 4, 10), H3 (6, 7, 13) |
| Every agent exercised | `run-investigator` (7, 8), `code-auditor` (5, 10) |
| User commands exercised | init (1, 2), new (11), audit (5, 8, 10), ship (9, 13). `doctor` is not walked through; its checks are the fallbacks in [07 §6](07-mcp-vs-cli.md) and the overlaps line in H1. |

## Sources
Doc URLs inline above, plus https://trigger.dev/docs/config/extensions/pythonExtension · https://trigger.dev/docs/management/tasks/trigger · https://trigger.dev/docs/ai-chat/transcript-storage · https://trigger.dev/docs/webhooks/slack · https://trigger.dev/docs/how-to-reduce-your-spend · https://trigger.dev/docs/deployment/preview-branches · https://trigger.dev/docs/cli-preview-archive
