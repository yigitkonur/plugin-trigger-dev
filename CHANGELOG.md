# Changelog

## 0.1.0

First release.

- **Skills:** `build`, `chat-agent`, `diagnose` (model-invocable, scoped to Trigger.dev contexts); `init`, `new`, `audit`, `ship`, `doctor` (user-invoked only). 13 scenario cards and 10 chat-agent playbooks hold decisions and pitfalls and link to the docs for API detail.
- **Hooks:** SessionStart project fingerprint (H1), PostToolUse edit tripwire with 14 high-precision rules (H2), PreToolUse prod guard for the CLI, package.json script aliases and MCP writes (H3). Silent outside Trigger.dev projects; `quiet` and `off` steering levels.
- **Engine:** `trigger-ctx` (`detect`, `guard`, `lint`, `scan`, `docs`, `links-check`), zero dependencies, always exits 0. 134 rules as data, including cross-file checks (duplicate task ids, undeclared queues, tasks outside `dirs`, version skew).
- **Agents:** `run-investigator` (read-only live run evidence) and `code-auditor` (judges located rule hits).
- **MCP:** the official `trigger.dev` MCP server, unchanged.
- **Checked live:** hook behaviour in headless Claude Code sessions; `init`, `ship` and `diagnose` against a real Trigger.dev Cloud project; the 14 hook rules on 42 public repositories; a 31-case eval suite with a no-plugin baseline and an official-skills comparison (positive cases: 0.98 vs 0.53 without the plugin and 0.59 with the official skills; two runs per case, see spikes item 20). Results and the places where the build differs from the design: `docs/spikes.md`.
