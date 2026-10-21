---
max_turns: 16
timeout_seconds: 480
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit, Bash]
tags: [tasks, positive, steering, bash]
---

Add a task in src/trigger that sends the order confirmation email through lib/mailer.ts when an order is paid.
