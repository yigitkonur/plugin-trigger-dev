---
type: llm
focus: trace
weight: 2
---

PASS if the code the assistant wrote opens the connection before the work and closes it in every path, including when the run throws, using task middleware with locals or other current hooks, and does not use the deprecated task options `init` or `cleanup`.
FAIL if the connection can leak when the run throws, or the deprecated options are used.
