---
max_turns: 16
timeout_seconds: 480
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [tasks, positive, steering, activation]
---

The welcome email job keeps retrying for ten minutes when Resend answers 400 for a bad address. Make it give up right away for that case.
