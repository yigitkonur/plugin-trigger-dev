---
type: llm
focus: trace
weight: 2
---

PASS if the code the assistant wrote (Write or Edit inputs, not text it read) throws AbortTaskRunError, imported from "@trigger.dev/sdk", for the 400 case.
FAIL if it only changes the retry settings, catches and swallows the error, or imports from "@trigger.dev/sdk/v3".
