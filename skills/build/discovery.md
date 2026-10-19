# Discovery: ask only what the repo cannot answer

Shared by `build`, `init` and `new`. The goal is the architecture, not a form. Ask with AskUserQuestion: 1 to 4 questions per call, 2 to 4 options each ("Other" is always available), at most two calls in a session (intent, then architecture). When you skip a question, state the inferred answer in one line so the user can correct it.

| Q | Question → options | What the answer decides | Skip when (infer from the repo) |
|---|---|---|---|
| Q1 | *What will Trigger.dev run first?* → Background or scheduled jobs · Long workflow with waits or approvals · AI chat agent · Reacting to webhooks or events | which card(s) | the user's message or `$ARGUMENTS` already says |
| Q2 | *Where does the work start?* → My app's backend · A schedule · The browser · An external service's webhook | SDK vs REST call site; trigger tokens; webhook path (own route vs beta) | implied by Q1 (a schedule), or the backend language is detected and the user said "from my API" |
| Q3 | *Does a user need to see progress or results live?* → No · Status or progress bar · Streamed text (LLM output) | metadata vs streams; the token route; `@trigger.dev/react-hooks` | **no frontend detected** (no react, vue, svelte, next, remix) → "No"; or Q1 is a chat agent (the transport handles it) |
| Q4 | *Does it need more than Node?* → No · Headless browser · ffmpeg or media · Python or system packages | build extensions and machine preset | dependencies answer it: `puppeteer`/`playwright` → browser; `fluent-ffmpeg` → media; `*.py` beside tasks or `@trigger.dev/python` → Python; `sharp` and `prisma` need no question |
| Q5 | *How much volume, and any limits?* → Low · Bursts from many users · Large batches (1k+) · A rate-limited external API | queues, `concurrency.perKey`, batch API, debounce, idempotency | the user already stated volume. For a single background or scheduled job, assume "Low" and say so. |
| Q6 (only for long workflows) | *What does it wait for?* → A fixed time · A person's approval · An external callback · Another task's result | `wait.for` vs waitpoint token vs webhook waiter (beta) vs `triggerAndWait` | Q1's free text already says |

Not asked at setup (they belong to `ship`): CI system, preview branches, Vercel or GitHub integration, where env vars come from. Ask about the plan tier only when the recommendation depends on it (schedules more often than hourly, preview branches, restricted API keys, private networking).

## Answers → architecture

| Answer | Primitives (card) | Docs for the decision record |
|---|---|---|
| jobs, started by a TS backend | `task` or `schemaTask`, type-only `tasks.trigger`, retries, idempotency key (`background-job`) | `tasks/overview`, `triggering`, `idempotency` |
| jobs, started by a Python/Go/Ruby backend | TS `trigger/` subpackage plus a REST trigger (`polyglot-caller`) | `management/tasks/trigger`, `apikeys` |
| a schedule | `schedules.task` with a declarative cron and timezone; `ttl` if runs can overlap (`scheduled-pipeline`) | `tasks/scheduled` |
| progress | `metadata` + `useRealtimeRun` + a read-token route (`progress-ui`) | `runs/metadata`, `realtime/auth`, `realtime/react-hooks/subscribe` |
| streamed text | `streams.define` + `useRealtimeStream` (`progress-ui`) | `tasks/streams`, `realtime/react-hooks/streams` |
| the browser starts the work | trigger token + `useTaskTrigger` (`progress-ui`) | `realtime/auth` |
| an external webhook | own route + `idempotencyKey` from the provider event id; hosted webhooks only if access is confirmed (`webhook-driven`) | `idempotency`, `webhooks/overview` (beta) |
| browser, media, Python | extension(s) + machine preset; extensions are no-ops in dev (`heavy-compute`) | per-extension page, `machines` |
| bursts from many users | `concurrency: { total, perKey }` + `concurrencyKey` (`fan-out-batch`) | `concurrency` |
| large batches | `batchTrigger(AndWait)` in chunks of at most 1,000 (`fan-out-batch`) | `triggering`, `limits` |
| a rate-limited API | a named `concurrencyLimit` + `retry.fetch` with a 429 strategy + debounce (`fan-out-batch`) | `concurrency`, `errors-retrying` |
| approval or callback | waitpoint token (+ `useWaitToken`), or a webhook waiter if beta access exists (`human-in-the-loop-and-callbacks`) | `wait-for-token`, `webhooks/waiters` |
| AI chat agent | the `chat-agent` skill | `ai-chat/quick-start` |

Record the decision in at most 15 lines: primitives, one line of why each, the doc link for each, and the files you will create. The user confirms before you write.
