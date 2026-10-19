---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [negative]
---

Add a background worker goroutine that retries failed webhook deliveries with exponential backoff.
