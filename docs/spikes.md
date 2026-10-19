# Phase-0 spikes and deviations from the design

Results of the spikes in [10 §1](design/10-roadmap-and-open-questions.md), measured on Claude Code 2.1.302 (macOS, Node 26.5) with a scratch plugin that dumped hook env and stdin. Recorded payloads (paths and ids sanitized) live in `tests/payloads/`.

| Spike | Result | Effect on the build |
|---|---|---|
| S10 hook env + stdin | Hook env carries `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` (for `--plugin-dir`: `~/.claude/plugins/data/<name>-inline`), `CLAUDE_PROJECT_DIR`, and `CLAUDE_ENV_FILE` (SessionStart only). `CLAUDE_PLUGIN_OPTION_STEERING` is **absent** when the user never configured the option, even with a `default` in the manifest. stdin has `session_id`, `cwd`, `permission_mode`, `hook_event_name`, `tool_name`, `tool_input`; PostToolUse adds `tool_response` (Write: `filePath`, `content`, `type`). | Scripts treat an unset `CLAUDE_PLUGIN_OPTION_STEERING` as `full`. Lint reads `tool_input.file_path`, then the file from disk. |
| S2 compound `if` | `Bash(*trigger deploy*)` and `Bash(*trigger*)` both fired for `echo hi && ./node_modules/.bin/trigger deploy`; neither fired for `echo ASKTEST`. | Plan kept as designed (one handler per rule, script still exits silently on non-matches). |
| S1 `ask` in `-p` | A PreToolUse `ask` in a headless run blocked the call and showed Claude the reason text. `ask` under interactive `bypassPermissions` was not tested; the guard denies there by design. | None. |
| S5 `` !`…` `` on model path | On 2.1.302 `` !`cmd` ``, `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` were all substituted when the skill was loaded through the Skill tool (with `allowed-tools` covering the command) and through `/plugin:skill`. plugin-swiftui's AGENTS.md says the opposite, so this is version-dependent. A Skill-tool call needs `Skill` allowed in headless runs. | Model-invocable skills still do not rely on injection (older versions); user-invoked skills may use it. |
| S6 MCP `tools/list` | 49 tools (snapshot: `scripts/ci/mcp-tools.snapshot.json`). Differences from [07 §2](design/07-mcp-vs-cli.md): see "Deviations". | H3 regex and `run-investigator` tools updated. |
| S4 `start_dev_server` | Input is only `configPath`; no `environment`/`branch`. | Worktrees use CLI `dev --branch` (as designed). |
| S3 CLI profile `apiUrl` | pending (needs login, stage D) | |
| S7 hook latency | Measured as the mean of 20 runs on macOS, Node 26.5 (`node -e 0` itself costs 31 ms): H1 on a Go repo **15 ms** (target ≤ 30); H1 with Node on a Trigger project 74-80 ms (target ≤ 300); `marker-gate.sh` without a marker 7 ms; `trigger-ctx guard` 34 ms. | Targets met; no work moved out of H1. |
| S8 Windows without Git Bash | not testable here (no Windows machine) | UNVERIFIED |
| S9 hook-rule precision | pending (stage E) | |

## Deviations from the design files

1. **`deploy` has `environment` default `prod`** in the live schema (enum `staging|prod|preview`); [07](design/07-mcp-vs-cli.md) said "no default". H3 treats a missing `environment` on `deploy` as `prod`.
2. **H3 MCP scope.** `send_agent_message` and `close_agent_chat` take only `chatId` (no `environment`), so the environment decision belongs to `start_agent_chat`; they are removed from the guard. `initialize_project` (creates a cloud project and writes files) and `submit_feedback` (sends text to Trigger.dev) are added: always `ask`.
3. **No `get_tasks` tool.** `trigger_task`'s description mentions it; the real tool is `get_current_worker`. Skills never name `get_tasks`.
4. **Extra read-only tools** the investigator can use: `get_span_details`, `get_task_schema`, `list_agents`, `list_prompts`, `get_prompt_versions`, `read_session_channel`, `list_dashboards`, `run_dashboard_query`.
5. **`start_dev_server`/`stop_dev_server`/`switch_profile` are annotated `readOnlyHint: true`** although they start a process or change state; the plugin does not trust annotations for safety decisions.
6. **`deploy --skip-update-check` context removed from H3.** The docs only say "Skip checking for `@trigger.dev` package updates"; they do not advise against it, so the plugin does not claim they do.
7. **`quiet` keeps the marker.** H1 writes the marker in `full` and `quiet` (printing only in `full`), so the script-alias half of H3 stays armed in `quiet`.
8. **Hook matchers are anchored** (`^(Edit|Write|MultiEdit)$`, `^(Bash|PowerShell)$`) because a matcher with regex characters is an unanchored regex.
9. **PowerShell alias handlers** call `node trigger-ctx.mjs guard --alias` directly (no `sh` gate) and check the marker in Node, so they work without Git Bash.
10. **The plugin's MCP server shows up in non-Trigger repos** (its instructions line is in context when the plugin is enabled at user scope), as the standing-cost table in 05 predicted; project-scope install avoids it.
