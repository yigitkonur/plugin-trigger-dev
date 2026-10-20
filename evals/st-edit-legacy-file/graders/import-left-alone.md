---
type: llm
focus: trace
weight: 2
---

PASS if the assistant's edits did NOT change the line `import { task } from "@trigger.dev/sdk/v3";` (a Write that rewrites the whole file must still contain that exact line, and no Edit may have it in old_string or new_string).
FAIL if the import line was rewritten to another path.
