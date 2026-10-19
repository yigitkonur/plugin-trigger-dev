---
type: llm
focus: trace
weight: 2
---

PASS if the answer or code uses storage (a TranscriptStorage implementation) and does not introduce hydrateMessages for new code, and mentions an ownership check for the transcript load action.
FAIL if it builds on hydrateMessages or omits the ownership check.
