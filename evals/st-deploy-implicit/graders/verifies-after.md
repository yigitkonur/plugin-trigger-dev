---
type: llm
focus: trace
---

PASS if the plan or the final message includes a check after the deploy: the new version listed for staging (list_deploys) or the worker's tasks (get_current_worker), or it says the deploy was not run and what would be checked.
FAIL if it only runs or prints the deploy command.
