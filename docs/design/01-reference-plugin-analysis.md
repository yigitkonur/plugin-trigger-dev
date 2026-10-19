# 01 — What plugin-swiftui teaches, and what transfers

Source: [yigitkonur/plugin-swiftui](https://github.com/yigitkonur/plugin-swiftui), v1.4.2, read at `main`. Read in full:
- the manifest and marketplace
- `AGENTS.md`
- 4 commands, the `swiftui-reviewer` agent, and `hooks/`
- `bin/swiftui-ctx`
- `scripts/audit-scan.py`, `scripts/audit-signals.tsv`, `scripts/swiftui-lint.sh`
- the `audit-macos-swiftui-full` orchestrator and its shared references
- `eval/`

## 1. Shape of the reference plugin

| Primitive | What it ships | Role |
|---|---|---|
| CLI engine | `scripts/swiftui-ctx` over a catalog built from 1,857 shipping macOS apps (`catalog/*.json`) | `lookup`, `search`, `deprecated`, `file <id>`, recipes: ground answers in real usage |
| PATH shim | `bin/swiftui-ctx` resolves its own directory, falls back to `CLAUDE_PLUGIN_ROOT` | the model can call a bare command; no path substitution needed |
| Skills | 33: 28 domain audits (`audit-swiftui-*`), 1 orchestrator (`audit-macos-swiftui-full`), `build-macos-swiftui`, `macos-app-patterns`, `swiftui-examples`, `swiftui-modernize` | knowledge split by audit domain; shared rules in `references/_shared/` |
| Commands | `swiftui` (lookup), `swiftui-review`, `swiftui-audit`, `swiftui-settings` | thin entry points that tell the model which CLI call to run |
| Agent | `swiftui-reviewer` (Bash, Read, Grep, Glob) | review with evidence; doesn't rewrite unless asked |
| Hook | one PostToolUse on `Edit\|Write\|MultiEdit` → `deprecation-guard.sh` → python | non-blocking deprecation nudge via `additionalContext` |
| Settings | `.swiftui-plugin/settings.md` frontmatter `enabled: false`, or `SWIFTUI_GUARD=off` | per-project kill switch for the hook |
| Eval | `eval/` baseline vs grounded, scored by deterministic oracles | proves the plugin helps |
| Packaging | Claude plugin + Codex plugin (with an MCP server) built from `packages/` | multi-agent reach |

## 2. Patterns, and whether each transfers

| # | Pattern in plugin-swiftui | Why it works there | Transfer to Trigger.dev? | How it appears in this plan |
|---|---|---|---|---|
| P1 | **One CLI engine, many front doors.** Commands, skills, agent and evals all call `swiftui-ctx`. | One deterministic implementation; skills stay prose about *when*, the engine does *what*. | **Yes.** | `trigger-ctx` with `detect`, `lint`, `scan`, `guard`, `docs`, `links-check` ([04 §5](04-plugin-architecture.md)). Hooks, skills, agents and CI share it. |
| P2 | **`bin/` PATH shim** that self-locates. AGENTS.md: `${CLAUDE_PLUGIN_ROOT}` substitution is "unreliable on the Skill-tool / model-invocation path". | The model types a bare command; no path errors. | **Yes, with a fallback.** `bin/` is on the Bash tool's PATH only, and claude.ai/Cowork org sync refuses plugins with a top-level `bin/` ([plugins reference](https://code.claude.com/docs/en/plugins-reference)). | `bin/trigger-ctx` plus a documented `node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs"` fallback. Hooks never use the shim (they get `CLAUDE_PLUGIN_ROOT` reliably). Open question 5 covers Cowork. |
| P3 | **Agent-facing JSON contract**: `{ ok, schema_version, result, next_actions: [{cmd, why}], error }`, stdout = data, stderr = logs, exit codes 0/2/3/4. | The model follows literal next commands instead of guessing. | **Yes.** | `trigger-ctx --json` uses the same envelope. Example: `detect` returns `next_actions: [{cmd: "trigger-ctx docs realtime/auth", why: "frontend detected, no token route"}]`. **Difference:** `trigger-ctx` always exits 0 (problems go in `ok:false`), because a non-zero exit inside `` !`…` `` aborts the whole skill ([skills](https://code.claude.com/docs/en/skills)). |
| P4 | **Relevance scan before auditing** (`audit-scan.py` + `audit-signals.tsv`: `always` vs `cond` regex per domain). | Only relevant auditors run, saving tokens and false positives. | **Yes.** | `trigger-ctx scan` relevance per domain (tasks, schedules, realtime, chat, webhooks, config, deploy, cost) → only those `code-auditor` instances spawn ([06 §4.1](06-flows-init-consult-audit.md)). |
| P5 | **"The engine LOCATES, never judges."** Grep tier-1 + optional ast-grep tier-2 → unified JSON; the agent reads each hit in full and reports only certain findings. | Cheap recall from the script, precision from the model. | **Yes.** | Same split. Rules carry a detection class (S, S+J, J, L). Only ≥ 95%-precise rules are allowed in the edit hook. |
| P6 | **Unified finding schema** (rule id, severity, file:line, evidence, fix, `fix_mode`). | Aggregation and dashboards are trivial. | **Yes.** | `findings.json` + `REPORT.md` with the same fields plus `doc` and `confidence`. |
| P7 | **8-point fix-safety protocol**: clean-tree gate, findings first, `fix_mode` auto/flag-only, one commit per finding, guards first, idempotent, never weaken a check, verify after fix. | Safe mass edits. | **Yes, trimmed.** | `audit --fix`: clean tree, findings first, `auto` only, one commit per rule family (Trigger.dev fixes are few and mechanical), re-scan. "Guards first" maps to MIG rules first. |
| P8 | **Dependency-ordered waves** of 28 auditors (guards → domains → scoring). | Later domains don't land on symbols about to be renamed. | **Partly.** | Trigger.dev has 8 domains, not 28. One wave of ≤ 4 parallel auditors; MIG fixes before others. |
| P9 | **Non-blocking PostToolUse nudge**: static grep, `additionalContext`, never denies the edit. | The model sees the problem right after writing it. | **Yes, hardened.** | H2. Differences:<br>• marker gate (one `stat` in non-Trigger repos; swiftui's hook spawns bash + python on every edit everywhere)<br>• no python dependency<br>• `applies_when` version gates<br>• dedupe<br>• `onFailure: "continue"` |
| P10 | **Per-project kill switch** (settings file + env var). | Users can silence noise. | **Replaced by a native primitive.** | `userConfig.steering` = `full`/`quiet`/`off` ([plugins reference](https://code.claude.com/docs/en/plugins-reference)), exposed to hooks as `CLAUDE_PLUGIN_OPTION_STEERING`. No extra settings file or settings command. |
| P11 | **Grounding corpus** (1,857 apps → catalog). | Real-world consensus beats model memory for a huge, evolving UI API. | **No corpus; use pinned docs instead.** | `@trigger.dev/sdk` ships 174 version-pinned docs in `node_modules`. They are the authoritative, version-matched source → tier 1 of the doc lookup. A usage corpus would add maintenance without beating the vendor's pinned docs. |
| P12 | **Eval harness: baseline vs grounded**, deterministic oracles (parse, deprecated count, lint findings, consensus regex). | Proves value without an LLM judge. | **Yes.** | `claude plugin eval` with/without the plugin. Graders: regex + `trigger-ctx lint` on the generated code as the oracle, plus `tsc --noEmit` against the SDK. Δ is computed from regex/llm graders only, because `tool_used: Skill` graders are excluded from Δ ([plugin evals](https://code.claude.com/docs/en/plugin-evals)). |
| P13 | **Version-bump discipline** (AGENTS.md: bump `version` on every user-facing change; installers gate updates on it). | Users actually receive fixes. | **Yes.** | Repo AGENTS.md rule + CI check that `plugin.json` version changed when shipped files changed. |
| P14 | **Commands are "model-first"**: bodies begin "This file is instructions for *you* to run…"; don't rely on `!` or `$ARGUMENTS` on the Skill-tool path. | Works whether the user or the model invokes. | **Adopted for model-invoked skills only.** | `build`, `chat-agent` and `diagnose` run `trigger-ctx detect` via Bash themselves. User-only commands (`disable-model-invocation: true`) are only ever invoked by the user, so `` !`trigger-ctx detect --brief \|\| true` `` and `$ARGUMENTS` are safe. Whether injection also runs on the model path is a Phase-0 spike; no design element depends on the answer. |
| P15 | **33 skills** (one per audit domain). | Fine-grained triggering in a huge UI domain. | **No.** | Every model-invocable skill costs listing tokens in every session. Trigger.dev has 3 *situations* (building, chat agent, something is wrong). Domain depth lives in lazily read cards, playbooks and rules. |
| P16 | **Codex packaging + MCP server** for other agents. | Reach. | **Not in v1.** | Trigger.dev already ships its own MCP server and agent-agnostic skills. This plugin's value is Claude Code-native steering (hooks, skills, agents). |
| P17 | **Review agent with evidence** (`swiftui-reviewer`). | Isolated review with permalinks. | **Yes, split by job.** | `code-auditor` (per domain, findings JSON) and `run-investigator` (live run data). Each returns a short verdict. |

## 3. What doesn't transfer, and why

- **Python in hooks.** swiftui's guard needs `bash` + `python3`. That's fine on macOS dev machines, but it breaks the "any stack, minimal dependencies" rule (Windows without Git Bash, slim containers).
  - This plan uses POSIX `sh` for the marker gate and SessionStart.
  - Node (which a Trigger.dev project already has) does JSON work, and only after the gate passes.
- **Hook spawning on every edit everywhere.** swiftui's hook runs bash + python on each `Edit|Write`, then filters on `*.swift`. In a plugin enabled at user scope that is pure overhead in non-Swift repos.
  - This plan's marker file makes H2 one `stat` outside Trigger.dev projects (N14).
- **A settings command.** `userConfig` is the native way to configure a plugin and is prompted at enable time.
- **Domain-per-skill granularity**: see P15.

## 4. Net lessons applied

1. Put the deterministic work in one engine; keep skills about decisions.
2. Make the engine's output tell the model what to run next.
3. Scan for relevance before spending tokens.
4. Let scripts find candidates and the agent decide.
5. Gate every automatic behaviour on "is this even a Trigger.dev project?"
6. Prove the plugin helps with a baseline-vs-plugin eval that uses the plugin's own linter as an oracle.

## Sources
https://github.com/yigitkonur/plugin-swiftui · https://code.claude.com/docs/en/plugins-reference · https://code.claude.com/docs/en/skills · https://code.claude.com/docs/en/hooks · https://code.claude.com/docs/en/plugin-evals
