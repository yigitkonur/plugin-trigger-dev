---
max_turns: 14
timeout_seconds: 420
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion, Write, Edit]
tags: [webhooks, positive]
---

When Stripe sends an invoice.paid webhook, run a Trigger.dev task that provisions the customer's account.
