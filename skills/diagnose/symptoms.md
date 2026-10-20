# Symptoms → ranked causes → first check

Always run the first check with an explicit environment. Doc paths are relative to https://trigger.dev/docs/.

| Symptom | Likely causes (ranked) | First check | Doc |
|---|---|---|---|
| Runs stuck QUEUED (deployed) | environment concurrency saturated; a restrictive queue limit; stalled runs holding slots; short waits holding slots; billing limit | MCP `get_report` (`key: "health"`, env prod); SDK `concurrencyLimits.retrieve` | `troubleshooting#runs-waiting-in-queue-due-to-concurrency-limits`, `concurrency` |
| Runs never start in dev | a second `trigger dev` instance on the same dev environment (the anchor below says one per project; `dev --branch` gives each parallel session its own); dev server down; dev TTL of 10 minutes | `dev_server_status`; use `trigger dev --branch <name>` per session | `troubleshooting#runs-never-dequeue-in-dev`, `deployment/dev-branches` |
| PENDING_VERSION | task or queue not in the deployed version; key for the wrong environment; skew pin not landed | `get_current_worker` (env); `list_deploys` | `troubleshooting#runs-stuck-in-pending-version` |
| `TASK_RUN_STALLED_EXECUTING` | blocked event loop (sync CPU work); dev Ctrl-C; machine too small | `get_run_details`; TRQL CPU for the run | `troubleshooting#task-run-stalled-executing`, `runs/heartbeats` |
| Timed out (`MAX_DURATION_EXCEEDED`) | `maxDuration` too low (it counts CPU time, not waits); a runaway loop | `get_run_details`; p95 `usage_duration` | `runs/max-duration` |
| Crashed or out of memory | memory over the machine preset (ffmpeg and browsers included) | `get_run_details`; TRQL memory per task | `machines` |
| `COULD_NOT_FIND_EXECUTOR` | dynamic `import()` of task modules | grep for `await import(` | `troubleshooting#could_not_find_executor` |
| 429 on trigger | trigger in a loop; batch bucket empty; webhook ingest limit | TRQL `api.rate_limit.denied` | `troubleshooting#rate-limit-exceeded`, `limits#rate-limits` |
| Runs Expired | TTL passed while queued | `list_runs` status; the task's `ttl` | `runs#time-to-live-ttl` |
| Schedule didn't fire, or fired late | dev CLI not running; not in the latest deploy; UTC vs local time; Cloud Free hourly floor; 60-minute spreading window | `list_runs` for the schedule's task | `tasks/scheduled` |
| A schedule fires several times | `schedules.create` without a `deduplicationKey`, called repeatedly | grep `schedules.create` (rule SCH-01) | `limits#schedules`, `tasks/scheduled` |
| Idempotency returned an old run | successful or cancelled runs keep the key (30-day TTL); plain keys are run-scoped since 4.3.1 | `runs.retrieve` on the returned id | `idempotency` |
| "Parallel waits are not supported" | `Promise.all` around waits | grep (rule TSK-01) | `troubleshooting#parallel-waits-are-not-supported` |
| Parent finishes before its children | an unawaited `trigger()` | grep (rule TSK-03) | `troubleshooting#when-triggering-subtasks-the-parent-task-finishes-too-soon` |
| `TASK_RUN_UNCAUGHT_EXCEPTION` | an EventEmitter "error" with no listener (db clients, queues) | `get_run_details` | `troubleshooting#uncaught-exceptions` |
| Environment variable not found in a deployed run | not set for that environment | `npx trigger.dev env list --env <e>` | `troubleshooting#environment-variable-not-found`, `deploy-environment-variables` |
| Run shows Completed but nothing happened | swallowed errors (caught and returned); a framework exception filter | code review | `errors-retrying` |
| Billing limit reached (Cloud) | spend cap hit | dashboard (a human) | `troubleshooting#runs-queued-because-a-billing-limit-was-reached`, `billing-limits` |
| Deploy fails with `resource_exhausted` | build infrastructure limits | rerun with `--native-build` | `troubleshooting#resource_exhausted` |
| `No loader is configured for ".node" files` | a native module not marked external | `trigger.config.ts` `build.external` | `config/config-file#external` |
| `pnpm dlx trigger.dev … init` stops with `ERR_PNPM_IGNORED_BUILDS` | pnpm 10 blocks dependency build scripts (esbuild, @depot/cli) until approved | rerun with `--allow-build=esbuild --allow-build=@depot/cli`, or use `npx trigger.dev@latest` | `cli-init-commands` (the pnpm message itself is not in the docs; seen live with pnpm 10) |
| Deploy fails in CI on version mismatch | CLI and `@trigger.dev/*` versions differ | `trigger-ctx scan` (MIG-08); `npx trigger.dev@latest update` | `github-actions`, `upgrading-packages` |
| 422 after deploy | stale `TRIGGER_VERSION` or external id | the CI env | `deployment/atomic-deployment` |
| Prisma errors in a deploy | missing extension, missing `mode`, no generate step | `trigger.config.ts` | `config/extensions/prismaExtension` |
| Realtime hook returns nothing or 401 | token has no scopes, wrong run id, expired token | the token route | `realtime/auth` |
| No alert despite failures | only an error-group alert, and the group is Unresolved | dashboard Alerts (a human) | `troubleshooting-alerts#why-it-goes-quiet` |
| Webhook didn't trigger (beta) | filtered; secret not set; 429; provider not registered | MCP `list_webhook_deliveries` then `get_webhook_delivery` | `webhooks/deliveries` |
| Chat: history gone after a deploy or crash | no object store on a self-host and no `storage` | config and env | `ai-chat/patterns/persistence-and-replay` |
| Chat: first reply is slow | cold boot | Preload or Head Start | `ai-chat/fast-starts` |
| Chat: `ChatChunkTooLargeError` | a tool output of about 1 MiB or more | log output sizes | `ai-chat/patterns/large-payloads` |
| Zod errors after upgrading | Zod below 3.25.56 or a major mismatch | `npm ls zod` | `troubleshooting-zod` |
