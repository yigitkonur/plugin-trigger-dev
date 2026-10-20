---
type: llm
focus: trace
weight: 2
---

PASS if the assistant edited src/trigger/sync-crm.ts so the task has a retry setting with maxAttempts 5 and exponential backoff (factor or minTimeoutInMs/maxTimeoutInMs or similar).
FAIL if the file was not changed or the retry count is not 5.
