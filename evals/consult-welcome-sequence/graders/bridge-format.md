---
type: llm
focus: last_message
weight: 2
---

PASS if the answer names concrete Trigger.dev primitives (for example wait.for for the delays, metadata with useRealtimeRun for progress, a read-scoped public token), explains why each fits, asks at most two clarifying questions, and cites trigger.dev docs links.
FAIL if it lists features generically, asks more than two questions, or has no docs links.
