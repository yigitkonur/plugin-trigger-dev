# Migrating v2/v3 to v4 (`migrate-v2-v3`)
**You're building:** a one-time upgrade of an existing v2 or v3 project to the v4 SDK, CLI and runtime.
**Not this card if:** the app already runs v4 and needs new tasks (`background-job`), CI deploy pins (`deploy-ci`), or a chat route move (the `chat-agent` skill's `migrate-route-handler` playbook).

**Primitives:**
- `npx trigger.dev@latest update` — because it upgrades every Trigger.dev package in one step; deploys fail on version mismatch.
- `import { task, schemaTask } from "@trigger.dev/sdk"` — because the `/v3` path still works only until it is removed.
- `catchError`, plus `locals` and middleware for setup — because `handleError` is renamed and `init` is deprecated.
- `schemaTask` + AI SDK `tool()` + `ai.toolExecute()` — because it is the v4 replacement for `toolTask`.
- `queue()` declared on the task — because queues can no longer be created on demand from trigger options.
- `batch.retrieve(handle.batchId)` — because `batchTrigger` no longer returns `runs` on its handle.
- Rejected: `toolTask`, `ai.tool()` — because both are deprecated.
- Rejected: staying on v3 on self-host — because 4.5.1+ rejects v3 triggers, batch triggers and deploys.

**Gates:** Cloud-only: v3 is shut down, so v3 triggers and deploys no longer run. Self-host: 4.5.0 is the last version that runs v3. Floors: Zod ≥ 3.25.56, OTEL exporters 0.203.x. No beta features.

**Ask only if unknown:**
- Cloud or self-hosted? — Cloud must migrate now; self-host can pin 4.5.0 until cutover.
- Still on v2 (`defineJob`, `eventTrigger`) or v3? — v2 means rewriting every task as `task()`, more work than the v3 renames.

**Minimal shape:**
```ts
// was: import { task } from "@trigger.dev/sdk/v3"
import { task, tasks, batch } from "@trigger.dev/sdk";

export const sendEmail = task({
  id: "send-email",
  onStart: ({ payload, ctx, task }) => {},
  catchError: ({ payload, ctx, task, error }) => {},
  run: async (payload: { to: string }, { ctx }) => {},
});

const handle = await tasks.batchTrigger([[sendEmail, { to: "a@example.com" }]]);
const result = await batch.retrieve(handle.batchId); // result.runs, not handle.runs
```

**Pitfalls → rules:**
- `trigger.dev` and `@trigger.dev/*` versions differ across package.json files, or a 3.x remains. Align them all, then run `npx trigger.dev@latest update`. (MIG-08)
- v2 `defineJob(` / `eventTrigger(` need a rewrite to `task()`, not a rename. (MIG-02)
- Hooks take one object, not `(payload, { ctx })`. `handleError`, `toolTask` and `init` are replaced. `ctx.attempt.id`/`status` and `ctx.task.exportName` are removed (`ctx.attempt.number` stays). Batch handle `.runs` is removed. Trigger-time queue objects need a predeclared `queue()`. (MIG-03, MIG-04, MIG-05, MIG-06, QUE-02)
- Zod below 3.25.56 is unsupported, and overrides can pin an old copy. `instanceof z.ZodError` stops matching Zod 4 errors; read `.issues`. (MIG-09)
- Cutover: during the drain, runs can use up to 2× concurrency; static IPs may change, so update allowlists before or right after switching. (no rule)

**Docs:** `migrating-from-v3` · `upgrading-packages` · `troubleshooting-zod`
