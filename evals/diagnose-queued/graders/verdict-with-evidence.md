---
type: llm
focus: last_message
weight: 2
---

PASS if the answer is based on the tool results (for example the health report saying the production environment is saturated by stalled runs), names the environment it checked, and gives a fix with a trigger.dev docs link.
FAIL if it invents run data, speculates without checking, or checks only the dev environment.
