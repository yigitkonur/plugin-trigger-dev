---
max_turns: 16
timeout_seconds: 480
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [tasks, positive, steering]
---

Add a task sync-crm in src/trigger that pulls contacts from our CRM API. Use the task's own hooks, not try/catch inside run: one that reports a failed attempt to Sentry through reportError from lib/sentry.ts and decides whether to retry, and one that logs a line each time an attempt starts.
