---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion]
tags: [tasks, positive]
---

My Trigger.dev task retries 3 times when the customer's card is declined, which is pointless. How do I stop retrying for that case only?
