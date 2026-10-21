# Prove it (shared by `build`, `init` and `new`)

Done means a run reached COMPLETED, or the answer says UNVERIFIED and gives the reason. Take the cheapest check that fits, in this order, and name the environment (dev unless the user says otherwise).

1. **The names exist.** `trigger-ctx docs <name>` for every API name you used that the card did not show. It says whether the installed types declare the name and quotes any `@deprecated` note.
2. **Typecheck** when `node_modules/@trigger.dev/sdk` exists: the project's own compiler with `--noEmit` (`npx tsc`, `pnpm exec tsc`, `yarn tsc` or `bunx tsc`, matching the package manager in the facts). Declared but not installed: say so and do not install packages unasked (`init` does that step).
3. **Login.** `npx trigger.dev@latest whoami` (it answers "You must login first" in seconds when logged out; MCP `whoami` can hang). Logged out: stop here with UNVERIFIED (not logged in) and point to `/trigger-dev:init` (resumable login, a human approves it in the browser).
4. **Run it in dev.** MCP `start_dev_server`, then `dev_server_status` until ready. `configPath` is the project directory that holds `trigger.config.*` (a file path fails with `spawn ENOTDIR`); omit it at the repo root and pass the directory in a monorepo. In a linked git worktree run `trigger dev --branch <name>` through Bash in the background instead (the MCP tool takes no branch). Then `get_current_worker` with `environment: "dev"` must list the task, `trigger_task` with `environment: "dev"` and a payload that matches the schema, and `wait_for_run_to_complete`. Ask first when the run sends messages, spends money or writes to a shared database; otherwise use a harmless payload.
5. **Report** the status, the output and the dashboard link. A failure goes to `get_run_details` and the `diagnose` skill, not to blind retries.

Reasons to state when a step could not run: dependencies not installed, not logged in, MCP not connected, or the task needs secrets or services the dev environment lacks (name them).
