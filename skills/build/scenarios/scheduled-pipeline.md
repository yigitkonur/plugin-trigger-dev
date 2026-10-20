# Scheduled pipeline (`scheduled-pipeline`)

**You're building:** a fixed-cron job (nightly import, hourly report) or per-user recurring runs (reminders) on Trigger.dev schedules.

**Not this card if:** the trigger is an external event (`webhook-driven`), or a run must pause mid-flow for a person or signal (`long-workflow-waits`).

**Primitives:**
- `schedules.task` with `cron` — because fixed schedules are code-owned and sync on `trigger dev` or deploy.
- `schedules.create({ task, cron, timezone, externalId, deduplicationKey })` — because per-user schedules are created at runtime; one schedule per `deduplicationKey`.
- `delay` — because a single future run needs no cron; there is no maximum on `delay`, and the TTL clock starts only after it elapses.
- `window` — because new schedules spread runs over a 60-minute default; `"0m"` fires on the exact cron minute on paid plans (Free treats it as the 60-minute minimum).
- Rejected: `schedules.create` for fixed schedules — because the docs prefer declarative for them, and imperative schedules need per-environment keys.

**Gates:** Cloud plan limits. Free: cron no more often than hourly, 60-minute minimum window, 10 schedules per project (Hobby 100, Pro 1,000+). Self-hosted deployments are unrestricted. No beta flag or version gate in the pinned docs.

**Ask only if unknown:**
- Fixed or per-user? Fixed means declarative `cron`; per-user means `schedules.create` with `externalId`.
- Which IANA timezone does the business use? It sets `timezone`; without it the cron runs in UTC.

**Minimal shape:**
```ts
import { schedules } from "@trigger.dev/sdk";
export const reminder = schedules.task({
  id: "todo-reminder",
  run: async (payload) => { /* payload.externalId is string | undefined */ },
});
// Called from your app handler: one schedule per deduplicationKey per project
await schedules.create({
  task: reminder.id,
  cron: "0 8 * * *", // 5 fields, evaluated in `timezone`
  timezone: user.timezone, // IANA, e.g. "America/New_York"
  externalId: user.id,
  deduplicationKey: `${user.id}-todo-reminder-${envName}`,
});
```

**Pitfalls → rules:**
- Six-field cron (with seconds) is not supported; write five fields (SCH-02).
- A string cron, or a pattern without `timezone`, runs in UTC; use `{ pattern, timezone }` for business-local times (SCH-03).
- `schedules.create` without `deduplicationKey` adds another schedule on every call, so runs multiply and cost rises (SCH-01). The key is per project; include the environment name (SCH-04).
- `schedules.task` with no `cron` and no `schedules.create` never fires (SCH-07). Dev fires only while `trigger dev` runs; staging and production fire only for the latest deployment.
- Long runs can overlap the next tick. `ttl` only expires runs still queued, so it does not stop overlap; cap it with `concurrency: { total: 1 }` on the task if overlap is harmful (SCH-05).

**Docs:** https://trigger.dev/docs/tasks/scheduled · https://trigger.dev/docs/limits#schedules · https://trigger.dev/docs/runs · https://trigger.dev/docs/management/schedules/create (web only)
