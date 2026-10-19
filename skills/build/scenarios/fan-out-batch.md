# Fan-out and batch processing (`fan-out-batch`)
**You're building:** one child run per row, customer or file, fired in bulk from a parent task.  **Not this card if:** one event is one run (`background-job`), or you need timed waits (`long-workflow-waits`).

**Primitives:**
- `batchTrigger` — fire-and-forget, up to 1,000 items per call, because a per-row `.trigger()` loop can exhaust the 1,500 req/min API limit.
- Rejected: `.trigger()` in a loop — because one request per row hits that limit.
- `batchTriggerAndWait` — when the parent needs outputs; check each `runs[i].ok`, because failures are per item.
- Rejected: `Promise.all` over `triggerAndWait` — because parallel waits are unsupported.
- `concurrency: { total }` on the child task — because it caps all its runs, keyed or not.
- `concurrency: { perKey, total }` + `concurrencyKey` on `.trigger()` — because each tenant gets its own pool and `total` bounds the sum.
- Rejected: `perKey` without `total` — because ten active keys at `perKey: 5` can run 50 at once.
- `concurrencyLimit({ name, total })` — because one named cap shared across tasks guards one external API.
- `idempotencyKeys.create(id)` in each item's `options` — because a retried parent otherwise re-triggers every child.

**Gates:** batches of 1,000 items, items up to 3 MB, and `AsyncIterable` input need SDK ≥ 4.3.1 (500 items before). The batch token bucket and batch processing concurrency are Cloud plan tiers (`limits.mdx`); the pinned docs give no self-host values. No beta features.

**Ask only if unknown:** Does the parent need child outputs? Yes → `batchTriggerAndWait`; no → `batchTrigger`. Is fairness per tenant or one shared external API? Tenant → `concurrencyKey` with `perKey`; shared API → `concurrencyLimit`.

**Minimal shape:**
```ts
import { task } from "@trigger.dev/sdk";
export const processUser = task({
  id: "process-user",
  concurrency: { total: 10 },
  run: async (payload: { userId: string }) => { /* work */ },
});
export const fanOut = task({
  id: "fan-out",
  run: async (payload: { userIds: string[] }) => {
    // one call per chunk of <= 1,000 items
    const handle = await processUser.batchTrigger(payload.userIds.map((userId) => ({ payload: { userId } })));
    return { batchId: handle.batchId };
  },
});
```

**Pitfalls → rules:**
- Looping `.trigger()` over rows exhausts the API limit; use `batchTrigger` (TSK-05)
- `Promise.all` around `triggerAndWait` or `batchTriggerAndWait`; use batch APIs or a sequential loop (TSK-01)
- More than 1,000 items per call, or no `BatchTriggerError` handling; chunk, and on `isRateLimited` wait `retryAfterMs` (TSK-06)
- `concurrency: { perKey }` without `total` grows unbounded with active keys (QUE-04)
- `.runs` on a `batchTrigger` result (SDK ≥ 4); use `batch.retrieve(handle.batchId)` (MIG-06)

**Docs:** `triggering` · `concurrency` · `idempotency` · `limits#batch-trigger-rate-limits` · `troubleshooting#parallel-waits-are-not-supported`
