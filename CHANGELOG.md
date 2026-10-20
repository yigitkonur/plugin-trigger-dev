# Changelog

## 0.1.1

A second, direct read of the shipped content (see `docs/spikes.md`, item 22). Two hook bugs and a set of guidance errors, all found by reading rather than by the eval suite.

- **Fixed: the edit tripwire and the `package.json`-script guard did not arm in the session that creates the project.** The marker that gates them was written only at SessionStart, so `/trigger-dev:init` in a repo that started without Trigger.dev got no checks on its first tasks. `marker-gate.sh` now makes one shell-only signal check when no marker exists and writes it (`hooks/signal.sh`, shared with `session-start.sh`); the PowerShell path does the same.
- **Fixed: no tripwire for project paths with non-ASCII characters on macOS** (for example `~/Masaüstü/...`): the shell built the marker key per character and Node per byte. The shell side is now byte-wise (`LC_ALL=C tr`).
- **Fixed guidance that contradicted the docs:** `chat.createSession` supports Head Start since 4.5.0; with `storage` the resume cursors arrive in `save` as `changeset.cursors`; approvals auto-submit with `lastAssistantMessageIsCompleteWithApprovalResponses`; waits over 5 s are unbilled while waits under 60 s keep the slot; `tasks.batchTrigger(id, items)`; `window: "0m"` is the 60-minute minimum on Free; the run-scoped idempotency default holds inside a task only; most extensions affect deployed builds only; and more (15 items). Every `Docs:` line is a full URL.
- **Fixed: the claim that four MCP tools work while logged out.** With no login MCP `whoami` hangs; `init` and `doctor` now check the login with the CLI first.
- **Narrowed skill permissions:** `init` no longer pre-approves every `npx trigger.dev@latest` subcommand (including an explicit `deploy --env prod`), `doctor` only `claude plugin list`, `ship` only `git branch --show-current`.
- **Honesty:** the README no longer calls the 14 hook rules "high-precision" (the public-repo corpus exercised one of them); `run-investigator` says what its Bash is for.
- **Tests:** `tests/marker.test.mjs` (10 checks; 6 fail on 0.1.0). Eval re-run for this release: original positive cases 0.98 (was 0.99), +0.43 over no plugin; two flaky cases moved and are measured against 0.1.0 in `docs/spikes.md`.

## 0.1.0

First release.

- **Skills:** `build`, `chat-agent`, `diagnose` (model-invocable, scoped to Trigger.dev contexts); `init`, `new`, `audit`, `ship`, `doctor` (user-invoked only). 13 scenario cards and 10 chat-agent playbooks hold decisions and pitfalls and link to the docs for API detail.
- **Hooks:** SessionStart project fingerprint (H1), PostToolUse edit tripwire with 14 high-precision rules (H2), PreToolUse prod guard for the CLI, package.json script aliases and MCP writes (H3). Silent outside Trigger.dev projects; `quiet` and `off` steering levels.
- **Engine:** `trigger-ctx` (`detect`, `guard`, `lint`, `scan`, `docs`, `links-check`), zero dependencies, always exits 0. 134 rules as data, including cross-file checks (duplicate task ids, undeclared queues, tasks outside `dirs`, version skew).
- **Agents:** `run-investigator` (read-only live run evidence) and `code-auditor` (judges located rule hits).
- **MCP:** the official `trigger.dev` MCP server, unchanged.
- **Checked live:** hook behaviour in headless Claude Code sessions; `init`, `ship` and `diagnose` against a real Trigger.dev Cloud project; the 14 hook rules on 42 public repositories; a 42-case eval suite with a no-plugin baseline and an official-skills comparison (original positive cases: 0.99 vs 0.55 without the plugin and 0.62 with the official skills; three runs per case, ties at 1.00 in four families, see spikes item 20); hook outputs replayed from recorded live sessions in CI. Results and the places where the build differs from the design: `docs/spikes.md`.

**Not in 0.1.0:** the failure-signature hook (H4) is deferred because no eval or live run showed the agent flailing on a CLI error. Windows without Git Bash is untested: the prod guard runs as plain Node there, the session fingerprint and edit checks need Git Bash and fail without blocking.
