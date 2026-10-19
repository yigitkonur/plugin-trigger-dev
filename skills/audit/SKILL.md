---
name: audit
description: Review a Trigger.dev codebase against the plugin's rule catalog (stale APIs, silent-failure patterns, config, deploy, cost) and write a findings report; optionally apply safe fixes.
argument-hint: "[path] [--focus cost|chat|realtime|deploy] [--live] [--fix]"
disable-model-invocation: true
allowed-tools: Bash(trigger-ctx *) Bash(node *trigger-ctx.mjs *) Bash(git status *) Bash(git diff *)
---

# Audit this Trigger.dev codebase

Arguments: $ARGUMENTS (path defaults to the project; `--focus` narrows the rule families; `--live` adds run data; `--fix` applies auto-fixable findings).

## Project facts

!`trigger-ctx detect --brief || true`

## Pipeline

1. **Scan.** Run `trigger-ctx scan <path> --json` (add `--focus <x>` when given). It returns `relevance` per domain (tasks, schedules, realtime, chat, webhooks, config, ci) and every located hit with rule id, severity, file, line, message, fix, doc and `detect`. Which rules exist: `${CLAUDE_PLUGIN_ROOT}/references/rule-catalog.md`. The engine **locates; it never judges**.
2. **Static report now.** Print the deterministic hits grouped by severity before any deeper work, so the user sees something immediately.
3. **Judge.** For each relevant domain (at most 4 concurrently) start a `code-auditor` agent with: the domain, its located hits (JSON), and the judgment rules (`detect` J or S+J) from `${CLAUDE_PLUGIN_ROOT}/scripts/rules/rules.json` for that domain's families. Each agent reads the files in full, drops false positives, and returns findings JSON. Domains map to families: tasks → TSK, QUE, SCH, MIG; realtime → RT; chat → CHT; webhooks → WH; config → CFG; ci → DEP; cost → COST (always, as a light pass).
4. **Live layer (only with `--live`, MCP connected, and the user agrees).** With explicit environments: `get_report` (health) per environment; TRQL for failure rate, retries, p95 `usage_duration`, cost per task, memory against the machine preset, and 429 denials; `get_current_worker` for schedules and machine presets. Attach this evidence to the COST and OPS findings and raise or lower their severity. Without MCP, say which live checks were skipped.
5. **Report.** Write `trigger-audit/REPORT.md` and `trigger-audit/findings.json` (or print only, if the user prefers). Every finding carries: rule id, severity, confidence, file:line, quoted evidence, the fact (why it is wrong), the fix, the doc URL, and `fix_mode`. Summarise counts by severity and domain and the top 5 fixes by impact. Add `trigger-audit/` to `.gitignore` unless the user wants it committed.
6. **Fix (only with `--fix`).** Clean working tree first (`git status`); a dirty tree means findings only. Write the report before changing code. Apply only findings with `fix_mode: auto` (import paths, the `defineConfig` import, hook signatures). Removed `ctx` fields and every `flag-only` finding stay as findings. One commit per rule family, then re-run the scan and show the hits dropped. Never weaken a rule or a check to make a finding disappear.

## Rules of the road

- Cite the doc URL with every finding; do not paste doc prose.
- Do not read or print secret values. For a leaked key report the file, line and key prefix only, and say to rotate it.
- A rule whose `applies_when` does not match the installed SDK (for example `sdk>=4` in a v3 project) is not a finding.
- Self-hosted target: skip cloud-only findings (plan limits, integrations, key presets).
