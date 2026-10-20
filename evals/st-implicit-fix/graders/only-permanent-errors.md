---
type: llm
focus: trace
weight: 2
---

PASS if the change aborts without retry only for client errors such as 400 (or 4xx other than 408/429), and still lets server errors (5xx) and rate limits (429) retry.
FAIL if it aborts on every non-ok response or removes the retries.
