---
type: llm
focus: last_message
---

PASS if the approval tool keeps an execute function (approval gates execution; it is not the question-tool pattern) and the answer mentions AI SDK 6 or newer for needsApproval.
FAIL if it tells the user to remove execute from the approval tool.
