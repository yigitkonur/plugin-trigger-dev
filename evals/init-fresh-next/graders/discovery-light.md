---
type: llm
focus: last_message
weight: 2
---

PASS if the answer asks at most two clarifying questions or states its assumptions instead, picks a scheduled task with a cron pattern and timezone, names the setup steps including logging in with the CLI (a human approves in the browser) and a dev run to prove it works, and cites docs.
FAIL if it asks many questions, skips the login step, or only describes features.
