---
name: init
description: Set up Trigger.dev in this repository with a short discovery, an explicit architecture decision, and a first task proven to run.
argument-hint: "[what you want Trigger.dev to run first]"
disable-model-invocation: true
allowed-tools: Bash(trigger-ctx *) Bash(node *trigger-ctx.mjs *) Bash(npx trigger.dev@latest *) Bash(pnpm dlx trigger.dev@latest *) Bash(yarn dlx trigger.dev@latest *) Bash(bunx trigger.dev@latest *)
---

# Set up Trigger.dev here

Goal from the user: $ARGUMENTS

## Project facts

!`trigger-ctx detect --brief || true`

(If the line above is empty or shows a command error, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs" detect --brief` yourself.)

## How to run this

Work through the stages in order. Each stage ends with something you can show. Human steps are marked **[you]**: do them with the user, never around them. Read `${CLAUDE_PLUGIN_ROOT}/skills/build/discovery.md` for the question bank and `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` for the invariants; both apply here.

### Stage 0: read the facts and branch

- Already set up (a root with `trigger.config.*`, SDK installed): say so and offer `/trigger-dev:new <capability>` or `/trigger-dev:audit`. Stop unless the user wants more.
- SDK 3.x or v2 code: read `${CLAUDE_PLUGIN_ROOT}/skills/build/scenarios/migrate-v2-v3.md` and offer the migration instead.
- No Node (`node` not on PATH): tasks cannot be written or run here. Explain that, offer the REST call site for the host language (`templates/rest-call-sites.md`) and stop.
- Caller-only repo (the SDK is a dependency, no config): the tasks live elsewhere; ask where, and build only the call site.
- Self-hosted target: say it once; never write `https://api.trigger.dev` into code, and skip cloud-only advice.

### Stage 1: intent (skip if the goal above is clear)

One AskUserQuestion, at most 4 options: background or scheduled jobs · long workflow with waits or approvals · AI chat agent · reacting to webhooks or events. A chat agent goes to the `chat-agent` skill's discovery (its stages 4 to 6 replace the ones below).

### Stage 2: architecture questions

One AskUserQuestion call with at most 2 questions, and only those the repo does not answer (`discovery.md`, Q2 to Q6). State every inferred answer in a line and give a default for everything else; the login and the project choice are human steps in stage 4, not extra questions here.

### Stage 3: decision record

At most 15 lines: the primitives, one line of why each, a doc link per primitive (`trigger-ctx docs <topic>` gives the path), and the files you will create. **[you]** confirm before anything is written.

### Stage 4: set up (human gates marked)

4a. **Auth.** `npx trigger.dev@latest whoami` first: logged out it answers "You must login first" in seconds, while the MCP `whoami` can hang with no login (use it once the CLI shows an account). If logged out, use the resumable login: `npx trigger.dev@latest login --no-browser --no-wait`, show the URL to the user, and **[you]** approve it in the browser (plus email verification for a new account); then run `npx trigger.dev@latest login --no-browser`. Do not pass `--email` or `--name` unless the user gives them. Never create an account for the user.
4b. **Project.** `list_projects` (or `npx trigger.dev@latest projects list`). **[you]** choose one, or confirm creating a new one (it creates a cloud resource). A fresh account needs `--project-name` and `--org-name` on `init -y`.
4c. **Install and config.** From the package directory that will hold the tasks (the Trigger root in a monorepo): `npx trigger.dev@latest init -y --project-ref <proj_…> --runtime node-24` (use the project's package manager: `pnpm dlx`, `yarn dlx`, `bunx`; add `--skip-package-install` when the install should be done another way, `--pkg-args` for package-manager arguments). pnpm 10 may stop with `ERR_PNPM_IGNORED_BUILDS` (esbuild, @depot/cli) before writing anything: rerun with `--allow-build=esbuild --allow-build=@depot/cli`, or use `npx`. If a config already exists, or tasks belong in a new `trigger/` subpackage of a Python/Go/Ruby repo, use the manual path in `templates/` instead.
4d. **Patch the config and package.json.** Add `trigger.dev` to devDependencies at the SDK's version, with scripts `"trigger:dev": "trigger dev"`, `"deploy:staging": "trigger deploy --env staging"` and `"deploy:prod": "trigger deploy --env prod"` (the project's own CLI keeps versions aligned in CI). Config: `defineConfig` from `@trigger.dev/sdk`; `dirs`; a default `maxDuration`; extensions with their own import paths and a pinned `runtime`; `.trigger` in `.gitignore`; the config file in the tsconfig `include`. Verify option names with `trigger-ctx docs config-file`.
4e. **Secret key (only if app code or a REST caller will trigger tasks).** **[you]** copy `TRIGGER_SECRET_KEY` for the right environment from the dashboard (API keys page; restricted presets exist only on Pro and Enterprise) into the git-ignored env file yourself. Do not ask the user to paste it into the chat, and never echo it.
4f. **First task and call site.** Write the task from the scenario card chosen in stage 3, then the call site: a type-only `tasks.trigger<typeof t>("id", payload)` in TypeScript, or a REST call in the host language with an idempotency key (`templates/rest-call-sites.md`). A realtime page also needs the token route (`templates/realtime-token-route.md`).

### Stage 5: prove it runs

1. Start the dev server: MCP `start_dev_server`, then `dev_server_status` until it is ready. Its `configPath` is the project **directory** that holds `trigger.config.*` (a file path fails with `spawn ENOTDIR`); omit it at the repo root and pass the directory in a monorepo. In a linked git worktree run `trigger dev --branch <name>` through Bash in the background instead (the MCP tool takes no branch).
2. `get_current_worker` with `environment: "dev"` must list the new task.
3. `trigger_task` with `environment: "dev"` and a payload that matches the task, then `wait_for_run_to_complete`.
4. Show status and output and the dashboard link. A failure: `get_run_details`, then `trigger-ctx docs "<error text>"` for the matching page; do not retry blindly.

Done means a run reached COMPLETED. If you could not run it (no login, no MCP), say UNVERIFIED and why.

### Stage 6: hand-off

List what exists. Offer next steps: `/trigger-dev:new` (a UI, a schedule, an approval step), `/trigger-dev:ship` (deploy), `/trigger-dev:audit`. Offer, and only with consent, a 5-line pointer in CLAUDE.md or AGENTS.md saying that Trigger.dev work goes through the `trigger-dev` plugin.
