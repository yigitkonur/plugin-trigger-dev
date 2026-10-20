# Stale knowledge: old → current

The single source for "the model remembers this, but it is out of date or wrong". The first column is grep-able: the weekly freshness job checks that none of these names comes back as current in the latest bundled docs. Rule ids point to `scripts/rules/rules.json`.

```deprecated
handleError
@trigger.dev/sdk/build
ctx.attempt.id
ctx.attempt.status
ctx.task.exportName
overrideConcurrencyLimit
defineJob
eventTrigger
chat.createAccessToken
getStartToken
hydrateMessages
toolTask
ai.tool(
syncVercelEnvVars
metadata.stream(
```

The block above is read by the weekly freshness job: it counts these names in the latest bundled docs (report only) so a name that comes back as current can be spotted.

## Imports and config

| Old (or wrong) | Current | Why / evidence | Rule |
|---|---|---|---|
| `import … from "@trigger.dev/sdk/v3"` | `import … from "@trigger.dev/sdk"` | the v3 entry still works in SDK 4 but is slated for removal | MIG-01 · https://trigger.dev/docs/migrating-from-v3 |
| `defineConfig` from `@trigger.dev/sdk/build` or `@trigger.dev/build` | `import { defineConfig } from "@trigger.dev/sdk"` | those exports do not exist; the official building-with-ai snippet is wrong | MIG-07 · https://trigger.dev/docs/config/config-file |
| `pythonExtension` from `@trigger.dev/build` | `@trigger.dev/python/extension` | each extension has its own import path | CFG-04 · https://trigger.dev/docs/config/extensions/overview |
| "only `project` and `dirs` are required" | `dirs` is optional; set a default `maxDuration` | docs require a default `maxDuration` | TSK-16 · https://trigger.dev/docs/config/config-file |
| every task must be a named export | hidden tasks: non-exported tasks can be triggered in v4 | | https://trigger.dev/docs/hidden-tasks |
| Prisma extension without `mode` | `mode` is required since 4.1.1: `legacy` runs `prisma generate` for you, `modern` and `engine-only` need your own generate step | | CFG-02 · https://trigger.dev/docs/config/extensions/prismaExtension |
| extensions run in `trigger dev` | most (`puppeteer`, `playwright`, `additionalPackages`) only affect deployed builds; `pythonExtension` also moves scripts in dev | test the build with `deploy --dry-run` | https://trigger.dev/docs/config/extensions/overview |
| `ffmpeg` extension alone | also mark `fluent-ffmpeg` external | | CFG-03 · https://trigger.dev/docs/config/extensions/ffmpeg |
| `runtime: "node"` is pinned | `node` floats with LTS; pin `node-24` for reproducibility; `bun` is experimental and the CLI still needs Node | | MIG-10 · https://trigger.dev/docs/config/config-file |
| hard-coded `retries.enabledInDev: false` | the docs disagree on the init default; state it, don't assume it | | https://trigger.dev/docs/errors-retrying |

## Tasks, hooks and triggering

| Old (or wrong) | Current | Why / evidence | Rule |
|---|---|---|---|
| `handleError` | `catchError` | renamed in v4 | MIG-03 · https://trigger.dev/docs/migrating-from-v3 |
| `onStart: (payload, { ctx }) =>` | `onStart: ({ payload, ctx }) =>` (all lifecycle hooks take one object; `run` keeps positional args) | | MIG-04 |
| `init:` / `cleanup:` task hooks | middleware and locals; `onStartAttempt` | | MIG-03 |
| `ctx.attempt.id`, `ctx.attempt.status`, `ctx.task.exportName` | removed; `ctx.attempt.number` remains | the /context page still lists them | MIG-05 · https://trigger.dev/docs/migrating-from-v3 |
| `const h = await x.batchTrigger(…); h.runs` | `const b = await batch.retrieve(h.batchId); b.runs` | | MIG-06 |
| `queue: { concurrencyLimit }`, `queues.overrideConcurrencyLimit` | `concurrency: { total, perKey }`, `concurrencyLimit()`, `concurrencyLimits.*` | | QUE-01 · https://trigger.dev/docs/concurrency |
| trigger-time `queue: { name, concurrencyLimit }` | declare the queue with `queue()` and reference it by name | /triggering still shows the old form; /migrating-from-v3 removes it | QUE-02 |
| `defineJob`, `eventTrigger` (v2) | `task()` | v2 is end of life | MIG-02 |
| `Promise.all([a.triggerAndWait(), b.triggerAndWait()])` | `batchTriggerAndWait`, or sequential awaits | "Parallel waits are not supported" | TSK-01 · https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported |
| reading `result.output` without checking | `result.ok` first, or `.unwrap()` | `triggerAndWait` returns a Result | TSK-02 · https://trigger.dev/docs/triggering |
| `wait.for` "durably pauses" | waits under 60 s keep the concurrency slot; ≤ 5 s are billed | | TSK-15 · https://trigger.dev/docs/wait |
| `maxDuration` as a wall-clock limit | it counts CPU time and excludes waits | | https://trigger.dev/docs/runs/max-duration |
| idempotency keys are global | since 4.3.1 plain keys are run-scoped; use `idempotencyKeys.create(k, { scope: "global" })` for global | | TSK-12 · https://trigger.dev/docs/idempotency |
| children inherit parent tags and metadata | they don't; pass them explicitly | | TSK-21 · https://trigger.dev/docs/runs/metadata |

## Realtime and auth

| Old (or wrong) | Current | Why / evidence | Rule |
|---|---|---|---|
| `auth.createPublicToken()` with no scopes | pass `scopes`; the bare token has no permissions | | RT-02 · https://trigger.dev/docs/realtime/auth |
| a "Trigger only" API-key preset for everyone | presets need Pro/Enterprise; Free, Hobby and self-host have unrestricted keys only | | https://trigger.dev/docs/apikeys |
| `useRun` with polling | `useRealtimeRun` | | RT-05 · https://trigger.dev/docs/realtime/react-hooks/swr |
| hooks docs list only run hooks | there are tag and batch hooks, `refreshAccessToken`, a 1 h auto-token and 28-day stream retention | | https://trigger.dev/docs/realtime/react-hooks/subscribe |

## Chat agents (SDK ≥ 4.5.0)

| Old (or wrong) | Current | Why / evidence | Rule |
|---|---|---|---|
| `import { streamText } from "ai"` inside `chat.agent` | destructure `streamText` from `run`'s argument, or spread `...chat.toStreamTextOptions()` | the stock import silently loses compaction, steering and injection | CHT-01 · https://trigger.dev/docs/ai-chat/backend#the-managed-streamtext |
| token and start-session actions without an ownership check | authorise the `chatId` against the signed-in user in **both** actions | otherwise any user can reach another user's chat | CHT-05 · https://trigger.dev/docs/ai-chat/quick-start |
| `chat.local` initialised in `onChatStart` | initialise in `onBoot` (runs on every fresh worker, including continuations) | | CHT-04 · https://trigger.dev/docs/ai-chat/lifecycle-hooks#onboot |
| `hydrateMessages` as the persistence model | `storage: TranscriptStorage`; `hydrateMessages` is deprecated | | CHT-08 · https://trigger.dev/docs/ai-chat/migrating-from-hydrate-messages |
| `onAction` returning a `streamText` result, string or message | return nothing or `chat.turn()` | | CHT-11 · https://trigger.dev/docs/ai-chat/actions |
| `await` the message write in `onTurnStart` | `chat.deferBeforeOutput()` | | CHT-09 · https://trigger.dev/docs/ai-chat/background-injection |
| "never give the human-in-the-loop tool an `execute`" | questions: no `execute`; approvals: `needsApproval` plus `execute` (AI SDK 6+) | | CHT-16 · https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop |
| Head Start "serves turn 1" | the warm server runs step 1 of turn 1 only | | https://trigger.dev/docs/ai-chat/fast-starts |
| `chat.createAccessToken`, `getStartToken`, transport `triggerConfig` | the two-callback transport; config lives in `createStartSessionAction` | | CHT-06 · https://trigger.dev/docs/ai-chat/upgrade-guide |
| `maxAttempts: 1` is the whole retry story | keep it, but add `oomMachine` (the only retry path) and idempotent tools | | CHT-18 · https://trigger.dev/docs/ai-chat/patterns/oom-resilience |
| `createLoadTranscriptAction` exported as is | wrap it with an ownership check; the format is roll-forward only | | CHT-12 · https://trigger.dev/docs/ai-chat/transcript-storage |
| snapshots work on self-host out of the box | self-host needs `OBJECT_STORE_*` or your own `storage` | | CHT-20 |

## Deploy and CI

| Old (or wrong) | Current | Why / evidence | Rule |
|---|---|---|---|
| `trigger deploy` in scripts and CI with no `--env` | pass `--env` explicitly (the default is prod) | | DEP-10 · https://trigger.dev/docs/cli-deploy-commands |
| one `TRIGGER_ACCESS_TOKEN` for every environment | a key per environment ("Deploy only" preset on Pro/Enterprise) | | DEP-02 · https://trigger.dev/docs/github-actions |
| preview workflow on `opened`/`synchronize` only | add `closed` so preview branches are archived | | DEP-03 |
| `--external-id ${{ github.sha }}` on pull requests | use the PR head sha | | DEP-04 · https://trigger.dev/docs/deployment/atomic-deployment |
| `syncVercelEnvVars` with the Vercel integration | remove it; the integration syncs | | DEP-07 · https://trigger.dev/docs/vercel-integration |
| `deploy --env-file` loads task env vars | it only hydrates the CLI process | | DEP-09 · https://trigger.dev/docs/cli-deploy-commands |
| parallel `trigger dev` sessions share a worker | `dev --branch` / `TRIGGER_DEV_BRANCH` gives each session its own branch; the troubleshooting page still says to keep one `dev` per project, so use branches and name the conflict | | https://trigger.dev/docs/deployment/dev-branches · https://trigger.dev/docs/troubleshooting#runs-never-dequeue-in-dev |

## Cost

| Old (or wrong) | Current | Rule |
|---|---|---|
| "a wait under 60 s is harmless" | waits over 5 s are not billed, but any wait under 60 s keeps the concurrency slot, and waits of 5 s or less are billed | https://trigger.dev/docs/wait |
| machine cost ratios from memory | read them from https://trigger.dev/docs/machines and https://trigger.dev/pricing; per-run invocation cost applies too | COST-01 |
| "sequential → batch saves compute" | a batch mainly saves wall time and API calls; whether it saves compute depends on the work (no page gives a comparison) | https://trigger.dev/docs/how-to-reduce-your-spend |

## Docs that disagree with each other

See `limits.md` for numbers. Others: `ctx.attempt.id` is listed in /context but removed per /migrating-from-v3 (use the migration page); `hydrateMessages` is "recommended" in /oom-resilience but deprecated per /migrating-from-hydrate-messages (use `storage`); MCP `get_report` defaults to **dev** while CLI `report` defaults to **prod** (always pass the environment); TRQL status values are title case in queries but upper case in the SDK.
