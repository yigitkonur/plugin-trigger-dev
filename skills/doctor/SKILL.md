---
name: doctor
description: Check the Trigger.dev toolchain around this project (Node, CLI login and profile, MCP server, versions, duplicate official skills, self-host target, plugin install scope) and report what to fix.
disable-model-invocation: true
allowed-tools: Bash(trigger-ctx *) Bash(node *trigger-ctx.mjs *) Bash(node *trigger-ctx.mjs" *) Bash(node --version) Bash(npx trigger.dev@latest whoami*) Bash(claude plugin list*) Bash(codex plugin list*) Bash(git rev-parse *)
---

# Trigger.dev doctor

## Project facts

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs" detect --json`

Report a table of checks, each OK, WARN or FAIL with the evidence and the fix. Never delete or edit anything yourself; recommend, and let the user act.

| Check | How | Fix when not OK |
|---|---|---|
| Node ≥ 18 on PATH | `node --version` | The plugin's edit checks and prod guard need Node and skip silently without it. Tasks need Node too (https://trigger.dev/docs/quick-start). |
| Trigger root and config | the facts above: `roots`, `config` | No root: `/trigger-dev:init`. A config that imports `defineConfig` from a path other than `@trigger.dev/sdk`: rule MIG-07. |
| SDK is the latest | `trigger-ctx detect --brief --latest` adds "SDK is current" or "N behind latest X" (needs network; skip it offline and say so) | Behind: WARN, and offer `npx trigger.dev@latest update`. A deliberate pin (the user says so, or a deploy needs it) stays; note it once. |
| Versions aligned | `versions.aligned`, `versions.major` | Mismatch: `npx trigger.dev@latest update` (CI fails on a mismatch). 3.x or 2.x: `scenarios/migrate-v2-v3.md`. |
| Logged in, which profile and API URL | `npx trigger.dev@latest whoami` (fails fast with "You must login first"); MCP `whoami` only after that, since it can hang without a login | Resumable login: `login --no-browser --no-wait`, the user approves, then `login --no-browser`. |
| Cloud or self-host | `target.kind`, `target.url` | Self-host: cloud-only advice is dropped; chat agents need `OBJECT_STORE_*` or your own `storage`. |
| MCP server connected | `/mcp` lists `trigger` (as `plugin:trigger-dev:trigger`, or the user's own `trigger` server when it is configured too: the plugin de-duplicates by command) | Two different Trigger.dev servers configured: keep one. `npx` offline: the CLI equivalents in `references/mcp-vs-cli.md`. |
| Duplicate guidance | `overlaps.officialSkills`, `overlaps.claudeMdPointer` | The official `trigger-*` skills (or the CLI's CLAUDE.md pointer) overlap this plugin. Recommend removing `.claude/skills/trigger-*` and the pointer line so one source of guidance remains; do not delete them for the user. |
| Install scope | `claude plugin list` (Claude Code) or `codex plugin list` (Codex) shows where `trigger-dev` is enabled | User scope adds the skill listing and MCP tool names to every repo. Recommend project scope: `claude plugin install trigger-dev@plugin-trigger-dev --scope project`. |
| Hooks working | `trigger-ctx guard` is silent for a harmless command; Git Bash present on Windows | Windows without Git Bash: the session fingerprint and edit checks cannot run (the prod guard still can). Install Git for Windows. |
| Git worktree | `worktree` in the facts | Parallel `trigger dev` sessions need `--branch <name>` each (`TRIGGER_DEV_BRANCH` is exported for this session). |
| Steering level | `CLAUDE_PLUGIN_OPTION_STEERING` (`full`, `quiet`, `off`) | `quiet` keeps only the prod guard; `off` disables hooks. |

End with the three most valuable fixes, in order.
