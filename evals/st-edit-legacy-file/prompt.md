---
max_turns: 16
timeout_seconds: 480
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [tasks, positive, steering]
---

In src/trigger/sync-crm.ts make the sync-crm task retry up to 5 times with exponential backoff.
