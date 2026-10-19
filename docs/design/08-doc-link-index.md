# 08 — Doc link index and link strategy

"Link, don't copy." The plugin's own text holds decisions, pitfalls and checks. API details come from the docs, fetched at the moment they're needed. This file defines:

- how the agent finds a page (§2)
- how it handles version, beta and plan gates (§3)
- the seed for `references/link-index.md` (§4)
- the CI that keeps links honest (§5)

---

## 1. Format of `references/link-index.md`

Each row has:
- **key**: a scenario or a symptom / error string
- **web path**: under `https://trigger.dev/docs/`
- **local**: whether the page is bundled in the SDK as `node_modules/@trigger.dev/sdk/docs/<path>.mdx`
- **since**: minimum SDK version, if the feature is gated
- **flags**: `beta`, `cloud`, `plan`
- **note**: a docs conflict or a trap

Size target: ≤ 250 rows, ≤ 25 KB. It is read with Grep for one key, never loaded whole.

What is bundled locally ([building-with-ai](https://trigger.dev/docs/building-with-ai)):
- `@trigger.dev/sdk` 4.7.4 ships 174 version-pinned pages, matching the installed code.
- **Not bundled:** `webhooks/*`, `guides/*`, `management/*`. These are always fetched from the web.

---

## 2. The 3-tier lookup (`trigger-ctx docs <topic|path>`)

```
1. local   node_modules/@trigger.dev/sdk/docs/<path>.mdx     (found from the trigger root; monorepo-aware)
2. MCP     search_docs "<topic>"                               (no login needed)
3. web     https://trigger.dev/docs/<path>.md                  (or llms.txt to discover a path)
```

`trigger-ctx docs`:
1. Resolves a topic through `link-index.md`.
2. Prints the local path if it exists, otherwise the web `.md` URL, plus `since` and flags.
3. Never prints page content. The agent reads the file or URL it's given.

Rules for the agent (top of `build`, `chat-agent` and `diagnose`):
- Verify every API name and signature you're about to write against tier 1 (if present) or tier 3. Tier 2 is for discovery when the path is unknown.
- **Local wins for API shape**: it matches the installed SDK.
- **Web wins for anything newer**: if the user is upgrading, cite web and say the local copy is older.
- Cite both in answers: `Docs: node_modules/@trigger.dev/sdk/docs/wait-for-token.mdx · https://trigger.dev/docs/wait-for-token`.
- Never paste doc prose. Quote at most one line when a word matters (e.g. "Parallel waits are not supported").

---

## 3. Gates: version, beta, plan, host

| Gate | Check | What the agent says |
|---|---|---|
| `since` > installed SDK | fingerprint `sdk` vs row `since` | "This needs SDK ≥ X (you have Y). Update with `npx trigger.dev@latest update` ([upgrading-packages](https://trigger.dev/docs/upgrading-packages))." |
| `beta` | always | "Private beta: [request access](https://trigger.dev/webhooks-beta). Without it: <fallback>." Never the default recommendation. |
| `cloud` | self-host detected | Drop the advice, or say it doesn't apply to self-hosted instances. |
| `plan` | ask only when the recommendation depends on it | "On Free/Hobby this isn't available; on Pro …" with a link to [pricing](https://trigger.dev/pricing) or [limits](https://trigger.dev/docs/limits). |

Known `since` values:

| Feature | Since |
|---|---|
| `defineConfig` from `@trigger.dev/sdk`; v4 APIs | 4.0.0 |
| Prisma extension `mode` required | 4.1.1 |
| Batch up to 1,000 items; idempotency scope change (run-scoped keys) | 4.3.1 |
| Input streams | 4.4.2 |
| `chat.agent` (AI chat runtime) | 4.5.0 |
| Public token from an environment API key | 4.5.8 |
| Version-skew protection (`--external-id`) | 4.5.12 |
| Zod ≥ 3.25.56 required | 4.6 |

Each is confirmed on its page when the index is built; CI re-checks it (§5).

---

## 4. Seed index

URL prefix `https://trigger.dev/docs/` is omitted in the path column. "L" = bundled locally.

### 4.1 By scenario (matches the 13 cards in `build/scenarios/` and the chat playbooks)

| Scenario | Primary pages | Supporting pages | Flags / notes |
|---|---|---|---|
| background-job | [tasks/overview](https://trigger.dev/docs/tasks/overview) L · [triggering](https://trigger.dev/docs/triggering) L | [tasks/schemaTask](https://trigger.dev/docs/tasks/schemaTask), [errors-retrying](https://trigger.dev/docs/errors-retrying), [idempotency](https://trigger.dev/docs/idempotency), [runs/max-duration](https://trigger.dev/docs/runs/max-duration) | `maxDuration` is CPU time |
| scheduled-pipeline | [tasks/scheduled](https://trigger.dev/docs/tasks/scheduled) L | [limits](https://trigger.dev/docs/limits#schedules), [runs](https://trigger.dev/docs/runs#time-to-live-ttl) | Free plan: no more often than hourly (`plan`) |
| fan-out-batch | [triggering](https://trigger.dev/docs/triggering) | [limits](https://trigger.dev/docs/limits#batch-trigger-rate-limits), [concurrency](https://trigger.dev/docs/concurrency#concurrency-keys-and-per-tenant-limits), [idempotency](https://trigger.dev/docs/idempotency) | batch 1,000 since 4.3.1 |
| long-workflow-waits | [wait](https://trigger.dev/docs/wait) · [wait-for](https://trigger.dev/docs/wait-for) · [wait-until](https://trigger.dev/docs/wait-until) | [concurrency](https://trigger.dev/docs/concurrency#short-time-based-waits-keep-their-slot), [how-it-works](https://trigger.dev/docs/how-it-works) | < 60 s keeps the slot; ≤ 5 s billed |
| human-in-the-loop-and-callbacks | [wait-for-token](https://trigger.dev/docs/wait-for-token) | [realtime/react-hooks/use-wait-token](https://trigger.dev/docs/realtime/react-hooks/use-wait-token), [webhooks/waiters](https://trigger.dev/docs/webhooks/waiters) | waiters: `beta` |
| progress-ui | [realtime/overview](https://trigger.dev/docs/realtime/overview) · [runs/metadata](https://trigger.dev/docs/runs/metadata) | [realtime/auth](https://trigger.dev/docs/realtime/auth), [realtime/react-hooks/subscribe](https://trigger.dev/docs/realtime/react-hooks/subscribe), [tasks/streams](https://trigger.dev/docs/tasks/streams), [realtime/react-hooks/streams](https://trigger.dev/docs/realtime/react-hooks/streams), [limits](https://trigger.dev/docs/limits#realtime-connections) | metadata 256 KB |
| heavy-compute | [config/extensions/overview](https://trigger.dev/docs/config/extensions/overview) · [machines](https://trigger.dev/docs/machines) | puppeteer / playwright / lightpanda / ffmpeg / pythonExtension / aptGet / additionalPackages pages; [runs/heartbeats](https://trigger.dev/docs/runs/heartbeats) | extensions are no-ops in dev |
| webhook-driven | [idempotency](https://trigger.dev/docs/idempotency) (own route) · [webhooks/overview](https://trigger.dev/docs/webhooks/overview) | [webhooks/sources](https://trigger.dev/docs/webhooks/sources), [webhooks/connect](https://trigger.dev/docs/webhooks/connect), [webhooks/filters](https://trigger.dev/docs/webhooks/filters), [webhooks/deliveries](https://trigger.dev/docs/webhooks/deliveries) | hosted webhooks: `beta`, web-only |
| polyglot-caller | [management/tasks/trigger](https://trigger.dev/docs/management/tasks/trigger) | [management/authentication](https://trigger.dev/docs/management/authentication), [apikeys](https://trigger.dev/docs/apikeys), [config/extensions/pythonExtension](https://trigger.dev/docs/config/extensions/pythonExtension) | management pages are web-only |
| ai-pipeline | [tasks/schemaTask](https://trigger.dev/docs/tasks/schemaTask) · [ai/prompts](https://trigger.dev/docs/ai/prompts) | [ai/observability](https://trigger.dev/docs/ai/observability), [tasks/streams](https://trigger.dev/docs/tasks/streams), [errors-retrying](https://trigger.dev/docs/errors-retrying) | — |
| cost-sensitive | [how-to-reduce-your-spend](https://trigger.dev/docs/how-to-reduce-your-spend) | [machines](https://trigger.dev/docs/machines), [run-usage](https://trigger.dev/docs/run-usage), [billing-limits](https://trigger.dev/docs/billing-limits), [observability/query](https://trigger.dev/docs/observability/query) | pricing ratios on [pricing](https://trigger.dev/pricing) (`cloud`) |
| migrate-v2-v3 | [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3) | [upgrading-packages](https://trigger.dev/docs/upgrading-packages), [troubleshooting-zod](https://trigger.dev/docs/troubleshooting-zod) | `/v3` import still works but will be removed |
| deploy-ci | [deployment/overview](https://trigger.dev/docs/deployment/overview) · [github-actions](https://trigger.dev/docs/github-actions) | [deploy-environment-variables](https://trigger.dev/docs/deploy-environment-variables), [deployment/preview-branches](https://trigger.dev/docs/deployment/preview-branches), [deployment/atomic-deployment](https://trigger.dev/docs/deployment/atomic-deployment), [deployment/dev-branches](https://trigger.dev/docs/deployment/dev-branches), [github-integration](https://trigger.dev/docs/github-integration), [vercel-integration](https://trigger.dev/docs/vercel-integration) | integrations `cloud`; skew protection since 4.5.12 |
| chat agent (all playbooks) | [ai-chat/overview](https://trigger.dev/docs/ai-chat/overview) · [ai-chat/quick-start](https://trigger.dev/docs/ai-chat/quick-start) | [ai-chat/backend](https://trigger.dev/docs/ai-chat/backend), [ai-chat/frontend](https://trigger.dev/docs/ai-chat/frontend), [ai-chat/lifecycle-hooks](https://trigger.dev/docs/ai-chat/lifecycle-hooks), [ai-chat/reference](https://trigger.dev/docs/ai-chat/reference) | since 4.5.0 |
| chat: migrate route | [ai-chat/migrating-from-a-route-handler](https://trigger.dev/docs/ai-chat/migrating-from-a-route-handler) | [ai-chat/upgrade-guide](https://trigger.dev/docs/ai-chat/upgrade-guide) | — |
| chat: persistence | [ai-chat/transcript-storage](https://trigger.dev/docs/ai-chat/transcript-storage) | [ai-chat/patterns/database-persistence](https://trigger.dev/docs/ai-chat/patterns/database-persistence), [ai-chat/patterns/persistence-and-replay](https://trigger.dev/docs/ai-chat/patterns/persistence-and-replay), [ai-chat/migrating-from-hydrate-messages](https://trigger.dev/docs/ai-chat/migrating-from-hydrate-messages) | self-host needs `OBJECT_STORE_*` |
| chat: approvals | [ai-chat/patterns/human-in-the-loop](https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop) | [ai-chat/actions](https://trigger.dev/docs/ai-chat/actions), [ai-chat/tools](https://trigger.dev/docs/ai-chat/tools) | `needsApproval` needs AI SDK ≥ 6 |
| chat: server/Slack/Linear callers | [ai-chat/server-chat](https://trigger.dev/docs/ai-chat/server-chat) | [webhooks/session-routing](https://trigger.dev/docs/webhooks/session-routing), [webhooks/slack](https://trigger.dev/docs/webhooks/slack), [webhooks/linear](https://trigger.dev/docs/webhooks/linear), [webhooks/channels](https://trigger.dev/docs/webhooks/channels) | channels/Slack/Linear `beta` |
| chat: fast first reply | [ai-chat/fast-starts](https://trigger.dev/docs/ai-chat/fast-starts) | — | Head Start runs step 1 only |
| chat: long conversations | [ai-chat/compaction](https://trigger.dev/docs/ai-chat/compaction) | [ai-chat/prompt-caching](https://trigger.dev/docs/ai-chat/prompt-caching), [ai-chat/patterns/large-payloads](https://trigger.dev/docs/ai-chat/patterns/large-payloads), [ai-chat/patterns/native-compaction](https://trigger.dev/docs/ai-chat/patterns/native-compaction) | — |
| chat: resilience | [ai-chat/error-handling](https://trigger.dev/docs/ai-chat/error-handling) | [ai-chat/patterns/oom-resilience](https://trigger.dev/docs/ai-chat/patterns/oom-resilience), [ai-chat/patterns/recovery-boot](https://trigger.dev/docs/ai-chat/patterns/recovery-boot), [ai-chat/patterns/version-upgrades](https://trigger.dev/docs/ai-chat/patterns/version-upgrades) | — |
| chat: sub-agents/sandbox | [ai-chat/patterns/sub-agents](https://trigger.dev/docs/ai-chat/patterns/sub-agents) | [ai-chat/patterns/code-sandbox](https://trigger.dev/docs/ai-chat/patterns/code-sandbox), [ai-chat/patterns/skills](https://trigger.dev/docs/ai-chat/patterns/skills), [ai-chat/side-channels](https://trigger.dev/docs/ai-chat/side-channels) | — |
| chat: test & ship | [ai-chat/testing](https://trigger.dev/docs/ai-chat/testing) | [ai-chat/mcp](https://trigger.dev/docs/ai-chat/mcp), [ai-chat/changelog](https://trigger.dev/docs/ai-chat/changelog) | — |
| operations | [observability/query](https://trigger.dev/docs/observability/query) · [reports](https://trigger.dev/docs/reports) | [observability/dashboards](https://trigger.dev/docs/observability/dashboards), [troubleshooting-alerts](https://trigger.dev/docs/troubleshooting-alerts), [replaying](https://trigger.dev/docs/replaying), [bulk-actions](https://trigger.dev/docs/bulk-actions) | — |
| tooling | [mcp-tools](https://trigger.dev/docs/mcp-tools) · [cli-introduction](https://trigger.dev/docs/cli-introduction) | [building-with-ai](https://trigger.dev/docs/building-with-ai), [skills](https://trigger.dev/docs/skills) | see [07](07-mcp-vs-cli.md) |

### 4.2 By symptom / error string (what users paste)

| Symptom or exact string | Page | Note |
|---|---|---|
| `Parallel waits are not supported` | [troubleshooting#parallel-waits-are-not-supported](https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported) | TSK-01 |
| Parent finishes before children | [troubleshooting#when-triggering-subtasks-the-parent-task-finishes-too-soon](https://trigger.dev/docs/troubleshooting#when-triggering-subtasks-the-parent-task-finishes-too-soon) | TSK-03 |
| `COULD_NOT_FIND_EXECUTOR` | [troubleshooting#could_not_find_executor](https://trigger.dev/docs/troubleshooting#could_not_find_executor) | TSK-07 |
| `TASK_RUN_STALLED_EXECUTING` | [troubleshooting#task-run-stalled-executing](https://trigger.dev/docs/troubleshooting#task-run-stalled-executing) · [runs/heartbeats](https://trigger.dev/docs/runs/heartbeats) | heartbeat interval: docs conflict (20 s vs 30 s) |
| `TASK_RUN_UNCAUGHT_EXCEPTION` / EventEmitter error | [troubleshooting#uncaught-exceptions](https://trigger.dev/docs/troubleshooting#uncaught-exceptions) | TSK-24 |
| Runs stuck in `PENDING_VERSION` | [troubleshooting#runs-stuck-in-pending-version](https://trigger.dev/docs/troubleshooting#runs-stuck-in-pending-version) | QUE-03, skew |
| Runs waiting in queue | [troubleshooting#runs-waiting-in-queue-due-to-concurrency-limits](https://trigger.dev/docs/troubleshooting#runs-waiting-in-queue-due-to-concurrency-limits) · [concurrency](https://trigger.dev/docs/concurrency) | — |
| Runs never dequeue in dev | [troubleshooting#runs-never-dequeue-in-dev](https://trigger.dev/docs/troubleshooting#runs-never-dequeue-in-dev) · [deployment/dev-branches](https://trigger.dev/docs/deployment/dev-branches) | second `trigger dev` |
| Billing limit reached | [troubleshooting#runs-queued-because-a-billing-limit-was-reached](https://trigger.dev/docs/troubleshooting#runs-queued-because-a-billing-limit-was-reached) · [billing-limits](https://trigger.dev/docs/billing-limits) | `cloud` |
| `Rate limit exceeded` / 429 | [troubleshooting#rate-limit-exceeded](https://trigger.dev/docs/troubleshooting#rate-limit-exceeded) · [limits#rate-limits](https://trigger.dev/docs/limits#rate-limits) | 1,500 req/min API |
| `resource_exhausted` on deploy | [troubleshooting#resource_exhausted](https://trigger.dev/docs/troubleshooting#resource_exhausted) | `--native-build` |
| `No loader is configured for ".node" files` | [config/config-file#external](https://trigger.dev/docs/config/config-file#external) | CFG-05 |
| Environment variable not found | [troubleshooting#environment-variable-not-found](https://trigger.dev/docs/troubleshooting#environment-variable-not-found) · [deploy-environment-variables](https://trigger.dev/docs/deploy-environment-variables) | DEP-08 |
| Timed out / `MAX_DURATION_EXCEEDED` | [runs/max-duration](https://trigger.dev/docs/runs/max-duration) | CPU time; docs conflict on the default |
| OOM / crashed | [machines](https://trigger.dev/docs/machines) | `retry.outOfMemory` |
| Run expired | [runs#time-to-live-ttl](https://trigger.dev/docs/runs#time-to-live-ttl) | dev TTL 10 min |
| Idempotency returned an old run | [idempotency](https://trigger.dev/docs/idempotency) | scope changed in 4.3.1 |
| Zod errors after upgrade | [troubleshooting-zod](https://trigger.dev/docs/troubleshooting-zod) | Zod ≥ 3.25.56 |
| Prisma errors in deploy | [config/extensions/prismaExtension](https://trigger.dev/docs/config/extensions/prismaExtension) | `mode` since 4.1.1 |
| CLI version mismatch in CI | [github-actions](https://trigger.dev/docs/github-actions) · [upgrading-packages](https://trigger.dev/docs/upgrading-packages) | MIG-08 |
| 422 after deploy (stale version) | [deployment/atomic-deployment](https://trigger.dev/docs/deployment/atomic-deployment) | DEP-06 |
| No alert received | [troubleshooting-alerts#why-it-goes-quiet](https://trigger.dev/docs/troubleshooting-alerts#why-it-goes-quiet) | — |
| Swallowed errors / NestJS | [troubleshooting](https://trigger.dev/docs/troubleshooting) (page; anchor ambiguous) · [errors-retrying](https://trigger.dev/docs/errors-retrying) | TSK-08, TSK-25 |
| Webhook didn't trigger | [webhooks/deliveries](https://trigger.dev/docs/webhooks/deliveries) | `beta` |
| `ChatChunkTooLargeError` | [ai-chat/patterns/large-payloads](https://trigger.dev/docs/ai-chat/patterns/large-payloads) | CHT-17 |
| Chat history gone after deploy | [ai-chat/patterns/persistence-and-replay](https://trigger.dev/docs/ai-chat/patterns/persistence-and-replay) | CHT-20 |
| Chat first reply slow | [ai-chat/fast-starts](https://trigger.dev/docs/ai-chat/fast-starts) | — |
| Private networking connection issues | [private-networking/troubleshooting](https://trigger.dev/docs/private-networking/troubleshooting) | `cloud`, `plan` |

### 4.3 Docs conflicts (the plugin cites the conservative reading and names the conflict)

| Topic | Page A | Page B | Plugin stance |
|---|---|---|---|
| Payload limit | [limits](https://trigger.dev/docs/limits#task-payloads-and-outputs): 3 MB | [triggering](https://trigger.dev/docs/triggering): "> 10 MB" offload | 3 MB |
| Output limit | limits: 10 MB | elsewhere: 100 MB | 10 MB |
| Default `maxDuration` | [runs/max-duration](https://trigger.dev/docs/runs/max-duration): must set | [config/config-file](https://trigger.dev/docs/config/config-file): unbounded by default | set a default (TSK-16 W) |
| Trigger-time queue object | [triggering](https://trigger.dev/docs/triggering) shows `queue: { name, concurrencyLimit }` | [migrating-from-v3](https://trigger.dev/docs/migrating-from-v3): removed | removed (QUE-02) |
| `ctx.attempt.id/status` | [context](https://trigger.dev/docs/context) lists them | migrating-from-v3: removed | removed (MIG-05) |
| `hydrateMessages` | [ai-chat/patterns/oom-resilience](https://trigger.dev/docs/ai-chat/patterns/oom-resilience) recommends | [ai-chat/migrating-from-hydrate-messages](https://trigger.dev/docs/ai-chat/migrating-from-hydrate-messages): deprecated | `storage` (CHT-08) |
| `retries.enabledInDev` init default | [manual-setup](https://trigger.dev/docs/manual-setup) | [errors-retrying](https://trigger.dev/docs/errors-retrying) | state it, don't hard-code |
| Machine config example | [machines](https://trigger.dev/docs/machines) shows v3 `TriggerConfig` | config-file | `defineConfig` from `@trigger.dev/sdk` |
| Heartbeat interval | 20 s | 30 s | cite the page, no number |
| Env default | MCP `get_report`: dev | CLI `report`: prod | always explicit |
| TRQL status case | title case (`'Failed'`) | SDK upper case | per surface |

---

## 5. Freshness (plugin CI, weekly + on PR)

1. **Status:** `curl -sL -m 20 -o /dev/null -w '%{http_code}'` on the `.md` variant of every URL in `link-index.md`, `rules.json`, the skills and the references → must be 200.
2. **Anchors:** fetch the `.md`, slugify headings Mintlify-style (lowercase, strip backticks, `.`/space/`/` → `-`, drop other punctuation, collapse hyphens), and also accept anchors the docs link to themselves. Unresolvable anchors fail CI.
3. **Coverage:** diff `llms.txt` against the index. New pages open an issue; removed pages fail CI.
4. **Local parity:** for each row marked L, check that `node_modules/@trigger.dev/sdk/docs/<path>.mdx` exists in the latest SDK tarball.
5. **Staleness:** grep the latest bundled docs for every deprecated name in `traps.md`. A name that reappears as current fails CI.
6. **Templates:** typecheck `skills/init/templates/*` against `@trigger.dev/sdk@latest`.
7. **Spec:** `claude plugin validate --strict`.
8. **MCP snapshot:** `npx trigger.dev@latest mcp` → `tools/list` diff against the committed snapshot (H3 regex, `run-investigator` tools).

## Sources
https://trigger.dev/docs/llms.txt · https://trigger.dev/docs/building-with-ai · https://trigger.dev/docs/skills · plus every page linked in §4.
