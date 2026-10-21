---
type: llm
focus: last_message
weight: 1
---

PASS if the final message tells the user that the file imports from `@trigger.dev/sdk/v3`, an older path that SDK 4 replaces with `@trigger.dev/sdk`, and leaves the decision to change it to the user (or offers to).
FAIL if the final message does not mention the import at all.
