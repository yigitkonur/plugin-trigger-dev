---
max_turns: 16
timeout_seconds: 480
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [tasks, positive, steering]
---

Add a task export-orders in src/trigger that exports yesterday's orders using the database client from lib/db.ts. A setup hook should open the connection before each run and a teardown hook should close it after the run, even when the run throws.
