---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion]
tags: [tasks, positive, round2]
---

My Trigger.dev task is occasionally killed for running out of memory on huge files. Retry it automatically on a bigger machine, only when that happens.
