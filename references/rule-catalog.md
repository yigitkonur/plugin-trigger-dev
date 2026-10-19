# Rule catalog

Generated from `scripts/rules/rules.json` by `node scripts/rules/render-catalog.mjs`. Do not edit by hand.

Severity: **E** error (broken or unsafe) · **W** warning (likely wrong or costly) · **I** info.
Detection: **S** script · **S+J** script locates, an agent confirms · **J** judgment · **L** live data.
Tier: **hook** = checked after every edit (precision ≥ 95%); **audit** = checked by `/trigger-dev:audit`.
`auto` = the audit may apply the fix; everything else is flag-only. 14 rules, 14 hook tier.

## MIG: stale APIs and migration

| ID | Sev | Det | Tier | Rule | Fix | Doc |
|---|---|---|---|---|---|---|
| MIG-01 | W | S | hook, auto | imports "@trigger.dev/sdk/v3"; with SDK 4 that path still works but is slated for removal | import from "@trigger.dev/sdk" | https://trigger.dev/docs/migrating-from-v3 |
| MIG-02 | E | S | hook | uses the v2 Job API (defineJob/eventTrigger), which no longer exists | rewrite as task({ id, run }) and trigger it with tasks.trigger() | https://trigger.dev/docs/introduction |
| MIG-04 | W | S | hook | lifecycle hook uses positional arguments (payload, { ctx }); in SDK 4 hooks receive one object ({ payload, ctx }) | change the hook to ({ payload, ctx, ... }) => {} | https://trigger.dev/docs/migrating-from-v3 |
| MIG-05 | W | S | hook | ctx.attempt.id, ctx.attempt.status and ctx.task.exportName were removed in SDK 4 (ctx.attempt.number remains) | use ctx.attempt.number, or drop the field | https://trigger.dev/docs/migrating-from-v3 |
| MIG-06 | E | S | hook | batchTrigger() no longer returns the runs list in SDK 4; the handle has no .runs | const b = await batch.retrieve(handle.batchId); then read b.runs | https://trigger.dev/docs/migrating-from-v3 |
| MIG-07 | E | S | hook, auto | defineConfig is not exported from "@trigger.dev/sdk/build" or "@trigger.dev/build" | import { defineConfig } from "@trigger.dev/sdk" | https://trigger.dev/docs/config/config-file |

## TSK: task authoring and reliability

| ID | Sev | Det | Tier | Rule | Fix | Doc |
|---|---|---|---|---|---|---|
| TSK-01 | E | S | hook | more than one wait runs inside Promise.all/allSettled/race ("Parallel waits are not supported") | use childTask.batchTriggerAndWait([...]) for fan-out, or await the waits one after another | https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported |

## SCH: schedules

| ID | Sev | Det | Tier | Rule | Fix | Doc |
|---|---|---|---|---|---|---|
| SCH-01 | E | S | hook | schedules.create() without deduplicationKey adds a new schedule on every call, so the task fires several times | add deduplicationKey (one stable key per schedule and environment) | https://trigger.dev/docs/tasks/scheduled |
| SCH-02 | E | S | hook | cron pattern has 6 fields; Trigger.dev cron has 5 (no seconds) | use a 5-field pattern: minute hour day-of-month month day-of-week | https://trigger.dev/docs/tasks/scheduled |

## RT: realtime, frontend, auth

| ID | Sev | Det | Tier | Rule | Fix | Doc |
|---|---|---|---|---|---|---|
| RT-01 | E | S | hook | a Trigger.dev secret key (or a public-prefixed variable holding it) is in source that can reach a browser or git | keep TRIGGER_SECRET_KEY in server-side env only, rotate the exposed key, and give browsers scoped public tokens | https://trigger.dev/docs/apikeys |
| RT-02 | E | S | hook | createPublicToken() without scopes returns a token with no permissions | pass scopes, e.g. { scopes: { read: { runs: [runId] } } } | https://trigger.dev/docs/realtime/auth |

## CHT: chat agents

| ID | Sev | Det | Tier | Rule | Fix | Doc |
|---|---|---|---|---|---|---|
| CHT-01 | E | S | hook | streamText is imported from "ai" in a chat.agent file; the stock import bypasses the agent's managed stream, compaction and steering | destructure streamText from run()'s argument ({ messages, signal, streamText }) or spread ...chat.toStreamTextOptions() | https://trigger.dev/docs/ai-chat/backend#the-managed-streamtext |
| CHT-04 | E | S | hook | a chat.local is initialised in onChatStart/onPreload, which do not run on continuation runs (run() then crashes with "chat.local can only be modified after initialization") | initialise chat.local in onBoot | https://trigger.dev/docs/ai-chat/lifecycle-hooks#onboot |
| CHT-11 | E | S | hook | onAction returns a response (streamText result, string or message); an action may only return nothing or chat.turn() | return chat.turn() to answer after the edit | https://trigger.dev/docs/ai-chat/actions#answering-after-an-action |
