---
name: diagnose
description: Find out why Trigger.dev runs or deploys misbehave (stuck QUEUED or PENDING_VERSION, failed, timed out, crashed or OOM, schedules not firing, 429s, CI deploy failures, chat history lost). Use when a Trigger.dev project shows an error, a run id such as run_abc123, or the user says a task did not run.
argument-hint: "[run id, task, or symptom]"
---

# Trigger.dev: diagnose

Evidence first, then a verdict, then a fix with a doc link. Symptoms arrive in plain language ("my cron didn't fire"); map them, check them, and say what you could not look at.

## Invariants

1. **Name the environment in every check and every claim.** MCP project tools default to dev, CLI `runs`/`report` default to prod. "Prod is healthy" must come from a call with `environment: "prod"`.
2. **Never invent run data.** If MCP is not connected or not logged in, say which checks you could not run, give the dashboard path or the CLI command for the user, and stop short of a verdict you cannot support.
3. **Evidence before verdict.** Cite run ids, span ids, a query result or a code line for each cause you name. Rank causes; do not list ten.
4. **Writes ask.** Replays, cancellations, prompt overrides and anything aimed at prod need the user's yes. The plugin's prod guard also asks.

## Procedure

1. Anchor on the project facts in context (or `trigger-ctx detect --brief`): SDK version, Cloud or self-host, Trigger roots (pass `configPath`/`projectRef` to MCP calls in a monorepo).
2. Find the symptom in `${CLAUDE_SKILL_DIR}/symptoms.md`. It gives ranked causes, the first check, and the doc.
3. Run the **first check** with an explicit environment: MCP `get_report` (health), `list_runs`, `get_current_worker`, `list_deploys`, `get_run_details`, or `get_query_schema` then `query` (TRQL ideas in `${CLAUDE_SKILL_DIR}/trql.md`). Without MCP: `npx trigger.dev@latest runs get <id> --env <e>`, `report health --env <e>`, or the dashboard.
4. A run id, or a task with large logs or traces: hand it to the `run-investigator` agent, which returns at most 25 lines (verdict, evidence ids, ranked causes, fix, doc). Do not read huge traces yourself.
5. Propose the fix with its doc link (the Doc column of `symptoms.md` names the page; `trigger-ctx docs "<error text>"` resolves it). If the fix is a code change, make it only when asked.
6. After the fix is deployed, offer a replay or bulk replay of the affected runs. Replays are writes: ask.

Plan-dependent facts (log retention, query lookback, concurrency, billing limits) differ by plan and by host. Billing limits, alerts and API-key presets are dashboard steps for a human: say where to click.

## Related

Code-level causes (parallel waits, unawaited triggers, dynamic imports) can also be found statically: `/trigger-dev:audit`. Design questions go to the `build` skill; chat-agent issues to `chat-agent`.
