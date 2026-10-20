---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion]
tags: [deploy, positive, round2]
---

Each pull request should get its own isolated Trigger.dev environment that is cleaned up when the PR closes. Is that possible and how?
