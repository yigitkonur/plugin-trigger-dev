# Cost-sensitive workloads (`cost-sensitive`)

**You're building:** tasks and triggers that spend the least compute per result, changed only with run-cost evidence.  **Not this card if:** one heavy CPU/memory job (`heavy-compute`), cron cadence (`scheduled-pipeline`), or failure triage only (the `diagnose` skill).

**Primitives:**
- Use the default `machine: "small-1x"`; raise it per task or per trigger (`tasks.trigger(…, { machine })`) only with evidence, because cost rises with preset size. Use `retry: { outOfMemory: { machine } }` for rare OOMs, because it upsizes only the retry, not the task.
- Rejected: `machine: "large-1x"` by default — because every run pays for it.
- Use `AbortTaskRunError` for known-permanent errors, because a plain throw is retried and burns compute on each attempt.
- Use `wait.for()`, `wait.until()` or `wait.createToken()` instead of polling, because waits over 5 s are not billed on Cloud (they still hold the concurrency slot until 60 s).
- Rejected: `setTimeout` or a polling loop in `run()` — because the wait is billed compute.
- Use `debounce: { key, delay, mode: "trailing" }` on `.trigger()`, because rapid triggers for one key collapse into one run.
- Use a stable `idempotencyKey` with `idempotencyKeyTTL`, because repeat work is skipped and the TTL bounds reuse.
- Measure first with `runs.retrieve()` (`costInCents`, `durationMs`) and TRQL `compute_cost` / `usage_duration`, because they show which task spends.

**Gates:** Cloud-only: billing limits and alerts (dashboard, not code), the 5-second wait exemption, and pricing (trigger.dev/pricing, web). Billing limits do not apply to self-hosted. No beta features; no SDK version gate in the pinned pages.

**Ask only if unknown:**
- Cloud or self-hosted? Billing limits and the wait exemption exist only on Cloud, so the levers differ.
- Which task dominates run cost? It sets the first lever; if unknown, run `audit --focus cost --live` first.

**Minimal shape:**
```ts
import { task, AbortTaskRunError } from "@trigger.dev/sdk";

export const syncDoc = task({
  id: "sync-doc",
  machine: "small-1x", // default; raise per trigger only with cost evidence
  maxDuration: 300,
  retry: { maxAttempts: 3, outOfMemory: { machine: "medium-1x" } },
  run: async (payload: { docId: string }) => {
    const result = await doSomething(payload);
    if (!result.success) throw new AbortTaskRunError(result.error); // permanent: no retry
    return result;
  },
});
// caller: collapse bursts for one doc into one run
await syncDoc.trigger({ docId }, { debounce: { key: docId, delay: "5s", mode: "trailing" } });
```

**Pitfalls → rules:**
- Known-permanent errors retried until attempts run out (COST-02)
- Large preset on every task, or on short or I/O-bound runs (COST-01)
- Polling with short waits or `setTimeout` in `run()`; waits under 60 s hold the slot (COST-04)
- Bursty per-key triggers with no `debounce`, or no max-delay cap on it (COST-03, TSK-23)
- No billing limit or alert set; a human sets it in the dashboard (COST-07)

**Docs:** `how-to-reduce-your-spend` · `machines` · `run-usage` · `observability/query` · `billing-limits`
