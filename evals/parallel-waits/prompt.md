---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [tasks, positive]
---

Write a parent task in src/trigger that takes a list of 200 user ids, runs the existing hello task for each id, and waits for all the results before returning them.
