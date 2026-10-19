---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [deploy, positive]
---

Set up GitHub Actions to deploy to Trigger.dev staging for every pull request and to production when we merge to main.
