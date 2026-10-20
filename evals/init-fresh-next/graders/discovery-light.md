---
type: llm
focus: last_message
weight: 2
---

PASS if the answer picks a scheduled task with a cron pattern, asks at most two clarifying questions (or states defaults instead of asking), and cites trigger.dev docs links. The setup steps may be summarised.
FAIL if it asks three or more questions, does not pick a scheduled task, or has no docs links.
