# Long-running workflow with waits (`long-workflow-waits`)
**You're building:** multi-day flows (onboarding drips, trial expiry) where a run pauses between steps.
**Not this card if:** nothing waits between steps (`background-job`, `scheduled-pipeline`); a human or external system must answer (`human-in-the-loop-and-callbacks`); the user needs live progress (`progress-ui`).

**Primitives:**
- Use `wait.for({ days: 3 })` or `wait.until({ date })`. Waits of 60 s or more checkpoint, so the run releases its concurrency slot while paused. Use `wait.until` for fixed deadlines (trial end) and `wait.for` for relative ones.
- Pass `idempotencyKey` to every wait. A retry skips a wait whose key was already used. Derive the key from a stable business id; `idempotencyKeyTTL` bounds how long the key is remembered.
- Rejected: `setTimeout`/`sleep` in `run()`. Because `wait.*` is the call that checkpoints, a timer keeps the run executing and holding its slot.
- Rejected: `wait.for` under 60 s in a polling loop. It stays `EXECUTING` and holds its slot for the whole wait.

**Gates:** Cloud-only billing. Paused time is not charged on Trigger.dev Cloud, and that no-charge note does not apply to self-host. Waits under 60 s don't checkpoint, so they are not paused time. No version or beta gate on these pages.

**Ask only if unknown:**
- Cloud or self-host? This decides whether the no-charge note applies to the cost estimate.
- Longest single wait, and how many runs wait at once? This decides whether a short-wait loop is acceptable or must move to waits of 60 s or more, or to a waitpoint token.

**Minimal shape:**
```ts
import { task, wait } from "@trigger.dev/sdk";

export const onboardingDrip = task({
  id: "onboarding-drip",
  run: async (payload: { userId: string }) => {
    await sendWelcomeEmail(payload.userId); // your step: must be safe to retry
    await wait.for({ days: 3, idempotencyKey: `drip-day3-${payload.userId}` });
    await sendTipsEmail(payload.userId);
  },
});
```

**Pitfalls → rules:**
- `setTimeout`/sleep loops standing in for multi-day waits (TSK-14)
- Polling with waits under 60 s eats concurrency (TSK-15)
- Wait idempotency key built from `Date.now()` or a random id, so it never matches on retry (TSK-11)
- `wait.*` inside `Promise.all`/`race` (TSK-01)
- Stream opened before a 1 h or longer wait with no writes (TSK-30)

**Docs:** `wait` · `wait-for` · `wait-until` · `concurrency#short-time-based-waits-keep-their-slot` · `how-it-works`
