# Doc link index

Read with Grep for one key; never load whole. Paths are relative to `https://trigger.dev/docs/` (`webhooks/*` pages are private beta and never the default; page URL = base + path, raw markdown = + `.md`). `L` = the first page is bundled in the SDK as `node_modules/@trigger.dev/sdk/docs/<path>.mdx` (version-pinned; wins for API shape). `since` = minimum `@trigger.dev/sdk`. Flags: `cloud` (does not apply to self-hosted), `plan` (plan-gated). Resolve with `trigger-ctx docs <topic>`.

| key | pages | L | since | flags | note |
|---|---|---|---|---|---|
| background-job; background job; background task; async work; run in background; queue a job; trigger task | tasks/overview, triggering, tasks/schemaTask, errors-retrying, idempotency, runs/max-duration | L |  |  | `maxDuration` is CPU time |
| scheduled-pipeline; scheduled; cron; schedule; recurring job; nightly; hourly; schedules.task | tasks/scheduled, limits#schedules, runs#time-to-live-ttl | L |  | plan | Free plan: no more often than hourly (`plan`) |
| fan-out-batch; fan-out; batch; batch trigger; bulk; many items; per-tenant; concurrency key | triggering, limits#batch-trigger-rate-limits, concurrency#concurrency-keys-and-per-tenant-limits, idempotency | L |  |  | batch 1,000 since 4.3.1 |
| long-workflow-waits; wait; long workflow; sleep; delay; wait.for; wait.until; durable workflow | wait, wait-for, wait-until, concurrency#short-time-based-waits-keep-their-slot, how-it-works | L |  |  | < 60 s keeps the slot; ≤ 5 s billed |
| human-in-the-loop-and-callbacks; human in the loop; approval; callback; wait token; waitpoint; external event | wait-for-token, realtime/react-hooks/use-wait-token, webhooks/waiters | L |  |  | waiters: `beta` |
| progress-ui; progress; progress bar; realtime; useRealtimeRun; metadata; live updates; react hooks; streams ui | realtime/overview, runs/metadata, realtime/auth, realtime/react-hooks/subscribe, tasks/streams, realtime/react-hooks/streams, limits#realtime-connections | L |  |  | metadata 256 KB |
| heavy-compute; heavy compute; build extension; extensions; puppeteer; playwright; ffmpeg; python; native; machine; browser; media | config/extensions/overview, machines, runs/heartbeats, config/extensions/playwright, config/extensions/lightpanda, config/extensions/additionalPackages, config/extensions/audioWaveform | L |  |  | extensions are no-ops in dev |
| webhook-driven; webhook; webhooks; incoming webhook; stripe webhook; github webhook | idempotency, webhooks/overview, webhooks/sources, webhooks/connect, webhooks/filters, webhooks/deliveries | L |  |  | hosted webhooks: `beta`, web-only |
| polyglot-caller; polyglot; python; go; ruby; php; rest api; management api; non-typescript; other language; trigger from python | management/tasks/trigger, management/runs/retrieve, management/authentication, apikeys, config/extensions/pythonExtension |  |  |  | management pages are web-only |
| ai-pipeline; ai pipeline; llm; prompts; ai sdk; structured output; ai task | tasks/schemaTask, ai/prompts, ai/observability, tasks/streams, errors-retrying | L |  |  | — |
| cost-sensitive; cost; spend; pricing; reduce cost; billing; machine size | how-to-reduce-your-spend, machines, run-usage, billing-limits, observability/query | L |  | cloud | pricing ratios on [pricing](https://trigger.dev/pricing) (`cloud`) |
| migrate-v2-v3; migrate; migration; v3; v2; upgrade; v4; breaking changes | migrating-from-v3, upgrading-packages, troubleshooting-zod | L |  |  | `/v3` import still works but will be removed |
| deploy-ci; deploy; ci; github actions; environments; preview branches; skew; env vars; vercel; integration; dev branch | deployment/overview, github-actions, deploy-environment-variables, deployment/preview-branches, deployment/atomic-deployment, deployment/dev-branches, github-integration, vercel-integration | L |  | cloud | integrations `cloud`; skew protection since 4.5.12 |
| chat agent; chat agent; chat.agent; ai chat; assistant; chat transport | ai-chat/overview, ai-chat/quick-start, ai-chat/backend, ai-chat/frontend, ai-chat/lifecycle-hooks, ai-chat/reference | L | 4.5.0 |  | since 4.5.0 |
| chat: migrate route; chat migrate route; useChat route; route handler; resumable-stream | ai-chat/migrating-from-a-route-handler, ai-chat/upgrade-guide | L |  |  | — |
| chat: persistence; chat persistence; transcript storage; chat history; hydrateMessages; database persistence | ai-chat/transcript-storage, ai-chat/patterns/database-persistence, ai-chat/patterns/persistence-and-replay, ai-chat/migrating-from-hydrate-messages | L | 4.5.0 |  | self-host needs `OBJECT_STORE_*` |
| chat: approvals; chat approvals; human in the loop chat; needsApproval; chat questions; actions | ai-chat/patterns/human-in-the-loop, ai-chat/actions, ai-chat/tools | L | 4.5.0 |  | `needsApproval` needs AI SDK ≥ 6 |
| chat: server/Slack/Linear callers | ai-chat/server-chat, webhooks/session-routing, webhooks/slack, webhooks/linear, webhooks/channels | L | 4.5.0 |  | channels/Slack/Linear `beta` |
| chat: fast first reply; fast first reply; head start; preload; slow first reply; fast starts | ai-chat/fast-starts | L | 4.5.0 |  | Head Start runs step 1 only |
| chat: long conversations; compaction; long conversations; prompt caching; large payloads; context window | ai-chat/compaction, ai-chat/prompt-caching, ai-chat/patterns/large-payloads, ai-chat/patterns/native-compaction | L | 4.5.0 |  | — |
| chat: resilience; chat resilience; oom; recovery boot; version upgrades; chat error handling | ai-chat/error-handling, ai-chat/patterns/oom-resilience, ai-chat/patterns/recovery-boot, ai-chat/patterns/version-upgrades | L | 4.5.0 |  | — |
| chat: sub-agents/sandbox; sub-agents; sub agents; code sandbox; skills; side channels; delegation | ai-chat/patterns/sub-agents, ai-chat/patterns/code-sandbox, ai-chat/patterns/skills, ai-chat/side-channels | L | 4.5.0 |  | — |
| chat: test & ship; chat testing; mockChatAgent; chat mcp; chat changelog; test chat agent | ai-chat/testing, ai-chat/mcp, ai-chat/changelog | L | 4.5.0 |  | — |
| operations; operations; observability; query; trql; reports; health; alerts; replay; bulk actions; dashboards | observability/query, reports, observability/dashboards, troubleshooting-alerts, replaying, bulk-actions | L |  |  | — |
| tooling; mcp; mcp tools; cli; cli introduction; building with ai; skills | mcp-tools, cli-introduction, building-with-ai, skills | L |  |  | see [07](07-mcp-vs-cli.md) |
| Parallel waits are not supported | troubleshooting#parallel-waits-are-not-supported | L |  |  | TSK-01 |
| Parent finishes before children | troubleshooting#when-triggering-subtasks-the-parent-task-finishes-too-soon | L |  |  | TSK-03 |
| COULD_NOT_FIND_EXECUTOR | troubleshooting#could_not_find_executor | L |  |  | TSK-07 |
| TASK_RUN_STALLED_EXECUTING | troubleshooting#task-run-stalled-executing, runs/heartbeats | L |  |  | heartbeat interval: docs conflict (20 s vs 30 s) |
| TASK_RUN_UNCAUGHT_EXCEPTION / EventEmitter error | troubleshooting#uncaught-exceptions | L |  |  | TSK-24 |
| Runs stuck in PENDING_VERSION | troubleshooting#runs-stuck-in-pending-version | L |  |  | QUE-03, skew |
| Runs waiting in queue | troubleshooting#runs-waiting-in-queue-due-to-concurrency-limits, concurrency | L |  |  | — |
| Runs never dequeue in dev | troubleshooting#runs-never-dequeue-in-dev, deployment/dev-branches | L |  |  | second `trigger dev` |
| Billing limit reached | troubleshooting#runs-queued-because-a-billing-limit-was-reached, billing-limits | L |  | cloud | `cloud` |
| Rate limit exceeded / 429 | troubleshooting#rate-limit-exceeded, limits#rate-limits | L |  |  | 1,500 req/min API |
| resource_exhausted on deploy | troubleshooting#resource_exhausted | L |  |  | `--native-build` |
| No loader is configured for ".node" files | config/config-file#external | L |  |  | CFG-05 |
| Environment variable not found | troubleshooting#environment-variable-not-found, deploy-environment-variables | L |  |  | DEP-08 |
| Timed out / MAX_DURATION_EXCEEDED | runs/max-duration | L |  |  | CPU time; docs conflict on the default |
| OOM / crashed | machines | L |  |  | `retry.outOfMemory` |
| Run expired | runs#time-to-live-ttl | L |  |  | dev TTL 10 min |
| Idempotency returned an old run | idempotency | L |  |  | scope changed in 4.3.1 |
| Zod errors after upgrade | troubleshooting-zod | L |  |  | Zod ≥ 3.25.56 |
| Prisma errors in deploy | config/extensions/prismaExtension | L |  |  | `mode` since 4.1.1 |
| CLI version mismatch in CI | github-actions, upgrading-packages | L |  |  | MIG-08 |
| 422 after deploy (stale version) | deployment/atomic-deployment | L |  |  | DEP-06 |
| No alert received | troubleshooting-alerts#why-it-goes-quiet | L |  |  | — |
| Swallowed errors / NestJS | troubleshooting, errors-retrying | L |  |  | TSK-08, TSK-25 |
| Webhook didn't trigger | webhooks/deliveries |  |  |  | `beta` |
| ChatChunkTooLargeError | ai-chat/patterns/large-payloads | L |  |  | CHT-17 |
| Chat history gone after deploy | ai-chat/patterns/persistence-and-replay | L |  |  | CHT-20 |
| Chat first reply slow | ai-chat/fast-starts | L |  |  | — |
| Private networking connection issues | private-networking/troubleshooting | L |  | cloud plan | `cloud`, `plan` |
| input streams; streams.input; realtime input stream | realtime/backend/input-streams, tasks/streams | L | 4.4.2 |  | since 4.4.2 |
| public token from env key; createPublicToken | realtime/auth | L | 4.5.8 |  | since 4.5.8 |
| skew protection; external deployment id; --external-id | deployment/atomic-deployment, github-actions | L | 4.5.12 |  | since 4.5.12 |
| prisma mode; prismaExtension | config/extensions/prismaExtension | L | 4.1.1 |  | mode required since 4.1.1 |
| mcp tools; trigger mcp server | mcp-tools, mcp-introduction | L |  |  | tool list; always pass the environment |
| rest api; trigger over http; management api | management/overview, management/tasks/trigger, management/authentication |  |  |  | web only; Bearer secret key |
| hidden tasks; non-exported tasks | hidden-tasks | L | 4.0.0 |  | tasks no longer need to be exported |
| machines; machine presets | machines | L |  |  |  |
| limits; payload size; rate limits | limits | L |  |  | numbers: references/limits.md |
| dev branches; trigger dev --branch; worktrees | deployment/dev-branches | L |  |  | parallel sessions need a branch each |
| preview branches; preview deploy | deployment/preview-branches, cli-preview-archive | L |  | cloud |  |
| api keys; secret key; presets | apikeys | L |  |  | key presets need Pro/Enterprise; cloud |
| login; whoami; profiles; switch | cli-login-commands, cli-whoami-commands, cli-list-profiles-commands, cli-switch | L |  |  | resumable login: --no-browser --no-wait |
| init; trigger.dev init; setup | quick-start, manual-setup, cli-init-commands | L |  |  |  |
| private networking | private-networking/overview, private-networking/aws-console-setup, private-networking/troubleshooting | L |  | cloud plan |  |
| run tests; test a task; dashboard test | run-tests | L |  |  |  |
| replay; bulk actions | replaying, bulk-actions, runs/bulk-actions | L |  |  |  |
