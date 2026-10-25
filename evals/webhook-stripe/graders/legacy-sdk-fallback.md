---
type: llm
focus: trace
weight: 2
---

The project is on @trigger.dev/sdk 4.7.4, which has no hosted webhooks (they need 4.8.0).
PASS if the solution is a normal route that verifies the Stripe signature and triggers the task with an idempotency key built from the Stripe event id, and the answer mentions that updating to 4.8.0 or newer would allow a hosted endpoint instead.
FAIL if it writes `webhooks.endpoint.define` or `webhook(` code against 4.7.4 without saying the SDK must be updated first.
