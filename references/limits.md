# Decision-relevant limits

Numbers that change a design choice, each with its source. Plan-dependent values are named, not quoted: read them from https://trigger.dev/docs/limits and https://trigger.dev/pricing for the user's plan. Self-hosted instances set their own limits.

| Limit | Value | Changes which decision | Source |
|---|---|---|---|
| Task payload | ≤ 3 MB per trigger (the SDK uploads payloads over 128 KB itself: `trigger` since 4.5.0, batch calls since 4.5.2) | pass a reference (object-store key, row id), not the data | https://trigger.dev/docs/limits#task-payloads-and-outputs |
| Task output | ≤ 10 MB | return ids, not blobs | https://trigger.dev/docs/limits#task-payloads-and-outputs |
| Batch trigger size | ≤ 1,000 items (since 4.3.1) | chunk larger sets | https://trigger.dev/docs/limits#batch-trigger-rate-limits |
| API rate limit | 1,500 requests/min (Cloud) | batch instead of `trigger()` in a loop | https://trigger.dev/docs/limits#rate-limits |
| Metadata | 256 KB per run | store large state elsewhere | https://trigger.dev/docs/runs/metadata |
| Tags | ≤ 10 per run, ≤ 128 characters | trim | https://trigger.dev/docs/tags |
| Idempotency | key ≤ 2,048 characters; TTL 30 days | key from stable business ids | https://trigger.dev/docs/idempotency |
| `maxDuration` | ≥ 5 s; counts CPU time, not waits | it does not bound wall-clock time | https://trigger.dev/docs/runs/max-duration |
| Waits | < 60 s keep the concurrency slot; ≤ 5 s are billed; checkpoint at 60 s | use `wait.for` ≥ 60 s or tokens, not polling | https://trigger.dev/docs/wait · https://trigger.dev/docs/concurrency#short-time-based-waits-keep-their-slot |
| Heartbeat stall | about 5 minutes without a heartbeat | sync CPU loops need `heartbeats.yield()` | https://trigger.dev/docs/runs/heartbeats |
| Run TTL | max 14 days (Cloud); dev run TTL 10 minutes | `ttl` on overlapping schedules | https://trigger.dev/docs/runs |
| Streams | 28-day retention, 300 MiB per stream; empty streams are deleted | long waits with no writes lose the stream | https://trigger.dev/docs/tasks/streams |
| Chat records | about 1 MiB (`ChatChunkTooLargeError`) | persist big tool outputs, emit an id | https://trigger.dev/docs/ai-chat/patterns/large-payloads |
| Schedules (Cloud Free) | not more often than hourly; new schedules get a 60-minute spreading window | paid plans: `window: "0m"` for the exact minute; Free treats it as the 60-minute minimum | https://trigger.dev/docs/tasks/scheduled |
| Plan-dependent | environment concurrency, queue sizes, schedule counts, preview branches, realtime connections, log retention, query lookback, API-key presets | ask only when the recommendation depends on it | https://trigger.dev/docs/limits |

## Machine presets: relative cost (Cloud list prices)

Cost per second relative to the default `small-1x`, from https://trigger.dev/pricing as of 2026-10-20 (`machine-prices.json` holds the exact rates; the weekly freshness job compares them with the live page, so confirm on the pricing page before quoting dollars). Hardware per preset: https://trigger.dev/docs/machines. Self-hosted instances have no per-second price.

| Preset | vCPU / GB RAM | Cost vs `small-1x` |
|---|---|---|
| micro | 0.25 / 0.25 | 0.5x |
| small-1x (default) | 0.5 / 0.5 | 1x |
| small-2x | 1 / 1 | 2x |
| medium-1x | 1 / 2 | 2.5x |
| medium-2x | 2 / 4 | 5x |
| large-1x | 4 / 8 | 10x |
| large-2x | 8 / 16 | 20x |

So `large-2x` costs about 10x `small-2x`, not 16x. Each run also pays an invocation fee ($0.25 per 10,000 runs), so floods of tiny runs cost more than their compute suggests. Larger machines save money only when they shorten the run enough.

## Docs that disagree (cite the conservative reading)

| Topic | Reading A | Reading B | Use |
|---|---|---|---|
| Payload limit | 3 MB per trigger (limits) | "hard limit above 10 MB" and offload above 512 KB (triggering) | 3 MB |
| Output limit | 10 MB (limits) | 100 MB elsewhere | 10 MB |
| Default `maxDuration` | "must set", minimum 5 s (runs/max-duration) | shown as an optional setting (config-file) | set a default |
| Heartbeat interval | 20 s | 30 s | cite the page, no number |
