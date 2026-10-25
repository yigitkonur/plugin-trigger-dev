# Changelog

## 0.4.0 - 2026-10-25

- feat: run in Codex too, off by default on both hosts (#3) (e685b78)

## 0.3.1 - 2026-10-25

- chore: reconcile baseline with Trigger.dev 4.8.1 (#2) (35e9c57)

## 0.3.0 - 2026-10-25

- feat: reconcile with Trigger.dev 4.8.1, always-latest rule, upstream tracking (4844d0b)

## 0.2.4 - 2026-10-25

- ci: switch to the shared release.py + release.yml (runs after ci is green on main) (0434225)

## 0.2.3

_2026-10-25, automatic release from the commits since v0.2.2._

- fix(skills): allowed-tools also matches the quoted engine path

## 0.2.2

_2026-10-25, automatic release from the commits since v0.2.1._

- fix(skills): project-facts injection drops '|| true' so it fits the allowed-tools pattern

## 0.2.1

_2026-10-25, automatic release from the commits since v0.2.0._

- fix(ci): release job sets the committer identity for the annotated tags too
- ci: automatic release job (bump both manifests, changelog, tags, GitHub release) so installed copies auto-update
- docs: README leads with the one-line install from claude plugin install --help, adds install-but-disabled recipe
- docs: spikes item 23 records the wrap-up typecheck check
- docs: README rewrite (lowercase, tested one-command install, known limits)
- docs: always-on token cost is about 1,000 with the ship description

## 0.2.0

A second review of how the plugin steers the agent, not only of what it says (`docs/spikes.md`, item 23). Everything below was found by running sessions and reading traces, and each fix was watched working.

- **Fixed: the project facts in `init`, `new`, `audit`, `ship` and `doctor` were never injected.** Their `!` shell lines called the bare `trigger-ctx`, which is not on the PATH of that shell (`command not found` in the eval harness), so those skills ran without the fingerprint. They now call `node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs"`.
- **`trigger-ctx docs` now checks API names, not only topics.** `docs catchError` says whether the installed SDK's types declare the name, quotes any `@deprecated` note and gives the pinned-doc `file:line`; a name it cannot find is reported as unverified. Before, `catchError`, `onStartAttempt` and `schemaTask` returned "no index row" and `idempotencyKeys.create` returned a wrong row.
- **Deprecated task options are caught while the code is written.** MIG-03 (hook tier) flags `handleError`, `onStart`, `init` and `cleanup`, which the 4.7 types mark `@deprecated`; the tool and stream APIs moved to MIG-12 (audit). The 0.1.0 decision to leave `onStart` out followed the migration guide's example and was wrong. Cards and the traps table teach `catchError`, `onStartAttempt` and middleware with `locals`. `scripts/ci/sdk-surface.mjs` checks `skills/` and `references/` against the SDK's types (weekly against `@latest`).
- **The tripwire says which hits are new.** After an `Edit` or `MultiEdit` it separates hits in the lines just written from hits already in the file ("not from this change"), so an old `/v3` import is a fact to mention, not a reason to rewrite code nobody asked about.
- **`build` loads for edit requests and proves its code.** The description now says "before changing any task file or `trigger.config.*`" (a plain "add a task" request loaded the skill 0 of 6 times before and 6 of 6 after). A new step 7 asks for a typecheck, a login check and a dev run, or UNVERIFIED with the reason; `build`, `chat-agent` and `diagnose` pre-approve the read-only helper commands so the check does not stop on a permission prompt.
- **`ship` is model-invocable** (scoped to Trigger.dev deploys, with a negative case for "deploy the app to Vercel"). A plain "deploy the jobs to staging" used to skip the preflight; now it runs the scan, uses an explicit `--env` and verifies the new version.
- **`diagnose`** no longer starts with MCP `whoami` (it can hang logged out) and does not stop when the CLI check is unavailable.
- **Evidence:** seven new steering-hard eval cases (red on 0.1.1: deprecated hook names, per-run setup, verify-after-build, plain deploy request), a hook-rule precision scan of 60 repositories (42 root-level and 18 nested SDK installs: MIG-01 59 hits all true, MIG-02 3 true, MIG-03 3 with one false positive, fixed), a subagent check (plugin hooks run inside subagents and their text reaches them, so no subagent hook was added).

## 0.1.1

A second, direct read of the shipped content (see `docs/spikes.md`, item 22). Two hook bugs and a set of guidance errors, all found by reading rather than by the eval suite.

- **Fixed: the edit tripwire and the `package.json`-script guard did not arm in the session that creates the project.** The marker that gates them was written only at SessionStart, so `/trigger-dev:init` in a repo that started without Trigger.dev got no checks on its first tasks. `marker-gate.sh` now makes one shell-only signal check when no marker exists and writes it (`hooks/signal.sh`, shared with `session-start.sh`); the PowerShell path does the same.
- **Fixed: no tripwire for project paths with non-ASCII characters on macOS** (for example `~/Masaüstü/...`): the shell built the marker key per character and Node per byte. The shell side is now byte-wise (`LC_ALL=C tr`).
- **Fixed guidance that contradicted the docs:** `chat.createSession` supports Head Start since 4.5.0; with `storage` the resume cursors arrive in `save` as `changeset.cursors`; approvals auto-submit with `lastAssistantMessageIsCompleteWithApprovalResponses`; waits over 5 s are unbilled while waits under 60 s keep the slot; `tasks.batchTrigger(id, items)`; `window: "0m"` is the 60-minute minimum on Free; the run-scoped idempotency default holds inside a task only; most extensions affect deployed builds only; and more (15 items). Every `Docs:` line is a full URL.
- **Fixed: the claim that four MCP tools work while logged out.** With no login MCP `whoami` hangs; `init` and `doctor` now check the login with the CLI first.
- **Narrowed skill permissions:** `init` no longer pre-approves every `npx trigger.dev@latest` subcommand (including an explicit `deploy --env prod`), `doctor` only `claude plugin list`, `ship` only `git branch --show-current`.
- **Honesty:** the README no longer calls the 14 hook rules "high-precision" (the public-repo corpus exercised one of them); `run-investigator` says what its Bash is for.
- **Tests:** `tests/marker.test.mjs` (16 checks; 6 fail on 0.1.0). An independent review of the hook diff found one blocking issue (a missing `signal.sh` exits 2 under dash), fixed with a test; the Codex review could not run because its login had expired. Eval re-run on the release commit: original positive cases 0.98 (was 0.99), +0.43 over no plugin, everything +0.29; `v4-hooks` is flaky (it fails about a third of runs, on 0.1.0 too; see `docs/spikes.md`).

## 0.1.0

First release.

- **Skills:** `build`, `chat-agent`, `diagnose` (model-invocable, scoped to Trigger.dev contexts); `init`, `new`, `audit`, `ship`, `doctor` (user-invoked only). 13 scenario cards and 10 chat-agent playbooks hold decisions and pitfalls and link to the docs for API detail.
- **Hooks:** SessionStart project fingerprint (H1), PostToolUse edit tripwire with 14 high-precision rules (H2), PreToolUse prod guard for the CLI, package.json script aliases and MCP writes (H3). Silent outside Trigger.dev projects; `quiet` and `off` steering levels.
- **Engine:** `trigger-ctx` (`detect`, `guard`, `lint`, `scan`, `docs`, `links-check`), zero dependencies, always exits 0. 134 rules as data, including cross-file checks (duplicate task ids, undeclared queues, tasks outside `dirs`, version skew).
- **Agents:** `run-investigator` (read-only live run evidence) and `code-auditor` (judges located rule hits).
- **MCP:** the official `trigger.dev` MCP server, unchanged.
- **Checked live:** hook behaviour in headless Claude Code sessions; `init`, `ship` and `diagnose` against a real Trigger.dev Cloud project; the 14 hook rules on 42 public repositories; a 42-case eval suite with a no-plugin baseline and an official-skills comparison (original positive cases: 0.99 vs 0.55 without the plugin and 0.62 with the official skills; three runs per case, ties at 1.00 in four families, see spikes item 20); hook outputs replayed from recorded live sessions in CI. Results and the places where the build differs from the design: `docs/spikes.md`.

**Not in 0.1.0:** the failure-signature hook (H4) is deferred because no eval or live run showed the agent flailing on a CLI error. Windows without Git Bash is untested: the prod guard runs as plain Node there, the session fingerprint and edit checks need Git Bash and fail without blocking.
