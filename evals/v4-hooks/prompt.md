---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [tasks, positive]
---

Write a task that retries with a custom error handler that logs the error and decides whether to retry.
