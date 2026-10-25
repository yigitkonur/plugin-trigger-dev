---
type: llm
focus: trace
weight: 2
---

PASS if the solution declares a hosted endpoint with `webhooks.endpoint.define` (source `webhooks.stripe()`) and subscribes the task with `webhook({ endpoint, ... })`, optionally filtered on `invoice.paid`, and it tells the user to set the endpoint's signing secret and copy the endpoint URL into Stripe.
FAIL if it writes its own HTTP route that verifies the signature by hand instead, or never mentions the signing secret.
