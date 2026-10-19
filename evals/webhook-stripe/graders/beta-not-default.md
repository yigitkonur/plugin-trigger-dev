---
type: llm
focus: trace
weight: 2
---

PASS if the solution is a normal route that verifies the Stripe signature and triggers the task with an idempotency key built from the Stripe event id, and any mention of Trigger.dev hosted webhooks labels them private beta rather than the default.
FAIL if hosted webhooks are the default recommendation.
