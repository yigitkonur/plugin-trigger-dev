---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [tasks, positive]
---

Add a background job that generates a PDF invoice for an order, and start it from the existing POST route in app/api/hello/route.ts once the order is created.
