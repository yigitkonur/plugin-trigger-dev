# Background job triggered from your app (`background-job`)
**You're building:** slow or flaky work (emails, PDFs, LLM calls, syncs) that a request handler enqueues without waiting for the result.  **Not this card if:** the work runs on a schedule (`scheduled-pipeline`), fans out to many runs (`fan-out-batch`), comes from a provider webhook (`webhook-driven`), or the caller is not TypeScript (`polyglot-caller`).

**Primitives:**
- `schemaTask({ id, schema, run })` — because it validates before every run; a mismatch fails with `TaskPayloadParsedError` and is not retried.
- `tasks.trigger<typeof task>("id", payload, options)` with `import type` — because the type-only import keeps task code out of the app bundle.
- `idempotencyKeys.create([businessIds])` as `{ idempotencyKey }` — because double-clicks and webhook redelivery would otherwise start a second run.
- Alternative: `yourTask.trigger()` from same-repo server code — because it validates `schemaTask` payloads at trigger time.
- Rejected: `triggerAndWait` in the app — because it is an error outside task code (TSK-04); for a result, subscribe via `runs.subscribeToRun` or Realtime.
- Hooks: `catchError` to decide a retry or report, `onStartAttempt` for per-attempt work, `onSuccess`/`onFailure`, and `tasks.middleware` with `locals` for setup and teardown — because the 4.7 types deprecate `handleError`, `onStart`, `init` and `cleanup`.
- Rejected: value import of task modules — because it bundles task code into the app (RT-12).
- A task that links to its own run (a Slack message, an email) builds the URL from `${process.env.TRIGGER_DASHBOARD_URL}/runs/${ctx.run.id}` (SDK ≥ 4.8.0; works on any instance, never hard-code the dashboard host).

**Gates:** none beta or cloud-only; `TRIGGER_DASHBOARD_URL` needs SDK ≥ 4.8.0. Self-host: set `TRIGGER_API_URL`. The caller authenticates with `TRIGGER_SECRET_KEY` for the target environment. Payload: stay under 3 MB (the docs disagree on larger values; see `references/limits.md`).

**Ask only if unknown:**
- Is the triggering backend TypeScript? If not, switch to `polyglot-caller`; the caller code changes entirely.
- Does the app need the result? If yes, subscribe (`runs.subscribeToRun` or Realtime); if no, fire-and-forget with an idempotency key.

**Minimal shape:**
```ts
// trigger/send-report.ts
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
export const sendReport = schemaTask({
  id: "send-report",
  schema: z.object({ orderId: z.string(), userId: z.string() }),
  run: async (payload) => { /* read secrets from env, not payload */ },
});
// app/api/route.ts (server code)
import { tasks, idempotencyKeys } from "@trigger.dev/sdk";
import type { sendReport } from "@/trigger/send-report";
const idempotencyKey = await idempotencyKeys.create([userId, "send-report", orderId]);
await tasks.trigger<typeof sendReport>("send-report", { orderId, userId }, { idempotencyKey });
```

**Pitfalls → rules:**
- Always `await` the trigger; an unawaited call's error never reaches your handler (TSK-03 is the in-task form).
- `tasks.trigger` skips `schemaTask` validation at trigger time; a bad payload fails only inside the run. Validate in the route, or use `yourTask.trigger()` from same-repo code.
- A key built from `randomUUID`, `Date.now` or `Math.random` never dedupes a repeat; derive it from a business id (TSK-11).
- A thrown plain `Error` retries; throw `AbortTaskRunError` for permanent failures (TSK-09; COST-02 for the spend).
- Pass ids, not files or base64 (TSK-19). Never put secrets in payloads; read them from env inside the task.

**Docs:** https://trigger.dev/docs/tasks/overview · https://trigger.dev/docs/triggering · https://trigger.dev/docs/tasks/schemaTask · https://trigger.dev/docs/errors-retrying · https://trigger.dev/docs/idempotency · https://trigger.dev/docs/apikeys
