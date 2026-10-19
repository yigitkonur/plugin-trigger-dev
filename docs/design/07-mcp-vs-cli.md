# 07 — MCP vs CLI: decision matrix and fallbacks

The plugin ships the official Trigger.dev MCP server unchanged. It also teaches the agent when the `trigger.dev` CLI, the REST API, or the dashboard is the better tool.

The short version:

> **MCP** for live account and run data, and for anything with no CLI equivalent.
> **CLI** for project lifecycle with flags (init, login, dev branches, deploy, promote, env, update) and for CI parity.
> **REST** with the secret key when neither MCP nor the CLI can run.
> **Dashboard** for settings only a human can change.
> **Always pass the environment explicitly.** The CLI defaults to `prod`; MCP defaults to `dev`.

This file is the source for `references/mcp-vs-cli.md`, which `build`, `diagnose`, `init` and `ship` read.

---

## 1. How the server is shipped

```json
{ "trigger": { "command": "npx", "args": ["trigger.dev@latest", "mcp"] } }
```

`.mcp.json` at the plugin root carries the same server name and arguments as the official Claude Code config ([mcp-introduction](https://trigger.dev/docs/mcp-introduction)). Design consequences:

| Fact | Consequence |
|---|---|
| Plugin servers connect at startup in every session where the plugin is enabled ([Claude Code MCP](https://code.claude.com/docs/en/mcp)). | Recommend **project-scope** enablement. At user scope, every repo pays for deferred tool names (≈250 tokens with Tool Search) and an `npx` spawn. |
| Plugin servers are **deduplicated by endpoint** against user and project servers; the user's own server wins. | If the user already ran `install-mcp`, tools appear as `mcp__trigger__*`, otherwise as `mcp__plugin_trigger-dev_trigger__*`. Every matcher, agent `tools:` list and allowlist in the plugin names **both prefixes**. `doctor` reports which one is live. |
| `trigger.dev@latest` floats. | The MCP server can be newer than the project's pinned CLI. Version-sensitive lifecycle actions (dev, deploy) go through the **project's** CLI (§4). |
| `--readonly`, `--dev-only` and `--project-ref` are server flags. | v1 ships the full server and relies on the H3 guard ([05](05-steering-and-hooks.md)). The README documents a one-line override for teams that want `--readonly` or `--dev-only` in their own `.mcp.json`; the user's server wins by dedupe. **Open question 2** in [10](10-roadmap-and-open-questions.md). |
| No plugin-level `--api-url` in v1. | Self-host goes through the current CLI profile (`login -a <url>`, `switch`), which the MCP server also uses (`whoami` shows the API URL). No cloud URL is hard-coded. |

---

## 2. MCP tool inventory

Sources: the published [MCP tools page](https://trigger.dev/docs/mcp-tools) and the CLI source (`packages/cli-v3/src/mcp/schemas.ts`, `tools.ts` on `main`).

**Common parameters** on every project tool: `projectRef`, `configPath` (monorepos), `environment` (`dev`|`staging`|`prod`|`preview`, **default `dev`**), `branch` (preview and branchable dev).

Columns:
- **W** = hidden by `--readonly` (from the source's `WRITE_TOOLS`).
- **Auth** = needs a CLI login.

| Group | Tool | W | Auth | Notable params / defaults | Plugin use |
|---|---|---|---|---|---|
| Docs | `search_docs` | | no | query | tier 2 of the doc lookup ([08 §2](08-doc-link-index.md)) |
| Profile | `whoami` | | yes | — | init 4a, doctor (shows API URL → self-host) |
| Profile | `list_profiles` | | no | — | doctor, self-host |
| Profile | `switch_profile` | | yes | profile | self-host / multi-account (session only) |
| Projects | `list_orgs`, `list_projects` | | yes | — | init 4b |
| Projects | `create_project_in_org` | W | yes | org, name | init 4b (always asks, H3) |
| Projects | `initialize_project` | W | yes | projectRef or name | fallback to CLI `init` |
| Tasks | `get_current_worker` | | yes | env | init 5, ship verify, diagnose PENDING_VERSION |
| Tasks | `trigger_task` | W | yes | `payload`, `options.{delay,tags (≤5 here),machine,region,idempotencyKey,maxAttempts,ttl (default "10m")}` | init/new proof run |
| Runs | `get_run_details` | | yes | `runId`, `maxTraceLines` (200), `cursor` | diagnose (via `run-investigator`) |
| Runs | `list_runs` | | yes | `status`, `taskIdentifier`, `tag`, `version`, `period`/`from`/`to`, `machine`, `region`, `limit` ≤ 100 | diagnose, audit `--live` |
| Runs | `wait_for_run_to_complete` | | yes | `timeoutInSeconds` (60) | init/new proof run |
| Runs | `cancel_run` | W | yes | `runId` | asks when env = prod (H3) |
| Runs | `replay_run` | W | yes | `runId` + overrides (payload, metadata, tags, queue, machine, version, …) | diagnose after a fix (asks in prod) |
| Deploy | `deploy` | W | yes | `environment` ∈ staging\|prod\|preview, **no default** ("ask the user"); skipPromotion; skipSyncEnvVars | fallback to CLI deploy (§4) |
| Deploy | `list_deploys` | | yes | env **default `prod`**, status, period | ship verify, diagnose |
| Deploy | `list_preview_branches` | | yes | — (hidden by `--dev-only`) | ship, deploy-ci card |
| Query | `get_query_schema` | | yes | env | always before `query` |
| Query | `query` | | yes | TRQL; `scope` environment (default)\|project\|organization; `period` or `from`/`to` | diagnose, audit `--live`, cost |
| Query | `list_dashboards`, `run_dashboard_query` | | yes | widget id; `period` default 1d | quick metrics |
| Query | `create_dashboard`, `set_dashboard_widgets` | W | yes | — | not used by the plugin |
| Reports | `get_report` | | yes | `health`; `period` default 1h; env default **dev** (deliberately; the CLI's `report` defaults to prod) | first check for "is prod healthy", audit `--live` |
| Dev | `start_dev_server` | | yes | waits ≤ 30 s for ready | init/new stage 5 |
| Dev | `dev_server_status`, `stop_dev_server` | | no | — | diagnose "runs never start in dev" |
| Chat | `list_agents` | | yes | env | chat smoke test |
| Chat | `start_agent_chat`, `send_agent_message`, `close_agent_chat` | W | yes | `agentId`, `clientData`, `preload` (true) | `test-verify-ship` playbook (asks in prod: real LLM spend) |
| Sessions | `read_session_channel` | | yes | `sessionId`, `channel`, `io`, cursor, `timeoutInSeconds` | chat side-channel debugging |
| Sessions | `write_session_channel` | W | yes | `sessionId`, `channel`, `value` | asks in prod |
| Webhooks (Beta) | `list_webhook_endpoints`, `get_webhook_endpoint_details`, `list_webhook_deliveries`, `get_webhook_delivery` | | yes | ids `wh_`/`whd_` | WH-03, diagnose "webhook didn't trigger" |
| Webhooks (Beta) | `replay_webhook_delivery`, `generate_webhook_secret`, `set_webhook_secret` | W | yes | — | secret tools **always ask** (shown once / replaces the existing secret) |
| Prompts (source only) | `promote_prompt_version`, `create/update/remove/reactivate_prompt_override` | W | yes | — | ask when prod: changes live behaviour without a deploy |
| Forthcoming (source only) | `get_span_details`, `get_task_schema` | | yes | — | Phase 0 snapshots `tools/list`; used if present |

**Docs vs source:** the docs say `--readonly` hides `deploy`, `trigger_task`, `cancel_run`, `replay_run`, the agent-chat tools, `write_session_channel` and the webhook write tools. The source list is longer (it adds project creation, prompts, dashboards, `submit_feedback`). The plugin treats the source list as authoritative and re-checks it in Phase 0.

---

## 3. CLI surface the plugin uses

Binary names:
- `npx trigger.dev@latest …` (or the package manager's `dlx` form)
- `trigger …` when the project has `trigger.dev` as a devDependency; the CI docs use `"deploy:trigger-prod": "trigger deploy"`

| Command | Default env | Writes? | Plugin use | Doc |
|---|---|---|---|---|
| `init -y --project-ref … --runtime … [--pkg-args …]` | — | files, deps | init 4c | [cli-init-commands](https://trigger.dev/docs/cli-init-commands) |
| `login --no-browser --no-wait` → `login --no-browser`; `login -a <url>` | — | profile | init 4a (human approves) | [cli-login-commands](https://trigger.dev/docs/cli-login-commands) |
| `whoami`, `list-profiles`, `switch`, `logout` | — | profile | doctor, self-host | [cli-whoami-commands](https://trigger.dev/docs/cli-whoami-commands), [cli-switch](https://trigger.dev/docs/cli-switch) |
| `dev [--branch <b>] [--env-file]` | dev | — | stage 5 in worktrees (run in background) | [cli-dev-commands](https://trigger.dev/docs/cli-dev-commands), [deployment/dev-branches](https://trigger.dev/docs/deployment/dev-branches) |
| `deploy [--env] [--branch] [--external-id] [--dry-run] [--native-build] [--env-file]` | **prod** | new version | ship 4 | [cli-deploy-commands](https://trigger.dev/docs/cli-deploy-commands) |
| `promote <version>` | **prod** | current version | ship 6 rollback | [cli-promote-commands](https://trigger.dev/docs/cli-promote-commands) |
| `env list [--show-values]`, `env get`, `env set [--secret]`, `env pull [--output] [--force]` | **prod**; no dev target | set/pull | ship preflight DEP-08 | [cli-env-commands](https://trigger.dev/docs/cli-env-commands) |
| `runs list/get/replay/cancel [-y]` | **prod** | replay/cancel | MCP fallback | [cli-runs-commands](https://trigger.dev/docs/cli-runs-commands) |
| `report health [--env]` | **prod** | — | MCP fallback | [reports](https://trigger.dev/docs/reports) |
| `preview archive --branch` | preview | archives | ship | [cli-preview-archive](https://trigger.dev/docs/cli-preview-archive) |
| `projects list/create` | — | creates | init 4b | [cli-projects-commands](https://trigger.dev/docs/cli-projects-commands) |
| `update` | — | package.json | MIG-08, version gate | [cli-update-commands](https://trigger.dev/docs/cli-update-commands) |

Common options on every CLI command: `--profile`, `--api-url` (or `TRIGGER_API_URL`), `--log-level`, `--skip-telemetry`. These are why self-host works without plugin-specific code.

There is no `trigger run <task>` command. A test run comes from MCP `trigger_task`, from SDK code, from the REST trigger endpoint, or from the dashboard Test page.

---

## 4. Decision matrix

| Need | Primary | Why | Fallback (in order) |
|---|---|---|---|
| Look up an API | local pinned `.mdx` → MCP `search_docs` → web `.md` | version match first; MCP needs no login | `llms.txt` |
| Log in | CLI resumable login | the MCP server reads the CLI profile; the browser step is human-only | — (human) |
| Which account/URL am I on? | MCP `whoami` | one call, shows API URL | CLI `whoami` |
| Create/choose project | MCP `list_projects` / CLI `projects create` | both fine; choose what's connected | dashboard |
| Initialise repo | CLI `init -y …` from the package directory | flags, monorepo dir, package manager | MCP `initialize_project`; manual setup ([manual-setup](https://trigger.dev/docs/manual-setup)) |
| Start dev | MCP `start_dev_server` | waits for ready, status tool for logs | CLI `dev` run in the background; **in a linked worktree always CLI `dev --branch <name>`** (MCP branch support is a Phase-0 spike) |
| What tasks are registered? | MCP `get_current_worker` (explicit env) | includes payload schemas | dev output; dashboard |
| Trigger a test run | MCP `trigger_task` (dev) | no code needed | SDK script; REST `POST /api/v1/tasks/{id}/trigger`; dashboard Test |
| Inspect a run | MCP `get_run_details` via `run-investigator` | traces are large → isolated agent | CLI `runs get` (no trace); dashboard |
| Health / "is prod OK" | MCP `get_report environment=prod` | interpreted verdict | CLI `report health --env prod`; REST `/api/v1/reports/health` |
| Metrics, cost, memory, 429s | MCP `get_query_schema` → `query` | TRQL; scope defaults to environment | REST `/api/v1/query` (secret key; PATs rejected); dashboard Query page |
| Deploy | **CLI** `deploy --env <e> …` via the project's own CLI version | flags (`--external-id`, `--dry-run`, `--native-build`), CI parity, the project's pinned version | MCP `deploy` (explicit env; not under `--dev-only`/`--readonly`) |
| Roll back | CLI `promote <version>` | no MCP tool | dashboard |
| Environment variables | CLI `env …` with explicit `--env` | no MCP tool | dashboard; REST env-vars endpoints; `syncEnvVars` extension |
| Preview branches | CLI `deploy --env preview`, `preview archive`; MCP `list_preview_branches` | — | dashboard |
| Concurrency at runtime | SDK `concurrencyLimits.*` / `queues.*` in a script | no MCP/CLI tool | REST; dashboard |
| Replay / cancel | MCP `replay_run` / `cancel_run` (asks in prod) | override options | CLI `runs replay/cancel --env …`; dashboard bulk actions |
| Chat agent smoke test | MCP `list_agents` → `start_agent_chat` → `send_agent_message` → `close_agent_chat` | real agent, real transport | `mockChatAgent` in tests ([ai-chat/testing](https://trigger.dev/docs/ai-chat/testing)) |
| Webhooks (Beta) | MCP webhook tools | deliveries are only visible there | REST webhooks API; dashboard |
| Alerts, billing limits, API-key presets, buying concurrency | **dashboard (human)** | no API | — |

**Monorepos.** MCP calls pass `configPath` and `projectRef` from the fingerprint. CLI commands run from the directory holding `trigger.config.*` (or pass `--config`).

**Which CLI binary.**
- Version-sensitive commands (`dev`, `deploy`, `update`) use the project's devDependency through its package manager: `pnpm exec trigger deploy`, `npx trigger deploy`, or the package.json script.
- `npx trigger.dev@latest` is only for commands that don't build code (login, whoami, env, runs, projects) and for repos without a devDependency.
- Why: CI fails when the CLI and the `@trigger.dev/*` packages differ ([github-actions](https://trigger.dev/docs/github-actions)), and the docs advise against bypassing the version check.

---

## 5. Default-environment traps (why invariant 8 exists)

| Surface | Default | Trap | Plugin defence |
|---|---|---|---|
| CLI `deploy`, `promote` | prod | "deploy this" ships to production | H3 asks unless `--env` is present; ship always passes `--env` |
| CLI `env list/get/set/pull` | prod | `env pull` writes **prod secrets** into `.env.local`; `--show-values`/`get` print them | H3 asks on implicit prod; `ship` uses `env list --env <e>` without values |
| CLI `runs cancel/replay` | prod | cancels a live run | H3 asks |
| CLI `report` | prod | — (read-only; safe) | not guarded |
| package.json scripts (`"deploy:trigger": "trigger deploy"`) | prod | the alias hides the default | H3 (b) resolves the script body; DEP-10 flags it in audits |
| MCP project tools | dev | "is prod healthy?" answered from dev data | invariant 8: always pass `environment`; `diagnose` rows name the env |
| MCP `list_deploys` | prod | — | pass env explicitly anyway |
| MCP `deploy` | none (tool description says "ask the user") | — | H3 asks for prod |
| MCP prompt overrides | env given by the call | changes live LLM behaviour without a deploy | H3 asks for prod |
| SDK in app code | env from the key prefix (`tr_dev_`, `tr_prod_`, …) | wrong key → wrong environment, PENDING_VERSION | fingerprint lists env-var *names*, never values; diagnose row |

---

## 6. When something isn't available

| Situation | Detected by | Behaviour |
|---|---|---|
| **Not logged in** | MCP auth error / `whoami` fails | Only `search_docs`, `list_profiles`, `dev_server_status` and `stop_dev_server` work. Offer the resumable login (human approves in the browser). Never create an account for the user. |
| **No Node/npx** (Python/Go/Ruby machine) | H1 (`command -v node`), doctor | MCP and CLI are both down. Static guidance plus the REST API with the secret key (curl/`requests`/`net/http`). Task authoring needs Node, so say so plainly and point to [quick-start](https://trigger.dev/docs/quick-start). H2/H3 linting is skipped silently. |
| **MCP server failed to start** (npx offline, proxy) | `/mcp` status, tool missing | CLI equivalents from §4. Docs via the local pinned `.mdx`, then web `.md`. |
| **Offline** | curl/npx fail | Local pinned docs (if the SDK is installed) and the plugin's own decisions only. State that live checks were skipped. |
| **Self-host** | `TRIGGER_API_URL`, or a non-default `apiUrl` in the current CLI profile (`whoami`) | CLI and MCP work through the profile. REST base comes from `TRIGGER_API_URL`. Cloud-only advice is dropped or flagged: API-key presets, plan limits, GitHub/Vercel integrations, preview-branch plan gating, private networking, billing limits. Chat agents need `OBJECT_STORE_*` for snapshots. |
| **`--readonly` server** (user's own config wins) | write tools absent | CLI for writes (still guarded by H3). |
| **`--dev-only` server** | `deploy`/`list_preview_branches` absent; other envs rejected | CLI for staging/prod reads and deploys. |
| **Org without webhooks Beta** | webhook tools return access errors / no endpoints | Own route plus `tasks.trigger` with the provider event id as `idempotencyKey` ([03](03-capability-map.md) A8, WH-06). |
| **Older pinned CLI than `@latest`** | fingerprint `cliVersion` vs MCP `whoami` | Lifecycle commands through the project's CLI (§4). Phase 0 checks whether MCP `start_dev_server` uses the local or the `@latest` CLI. |

---

## 7. REST, for non-TS callers and no-Node machines

| Need | Endpoint | Auth |
|---|---|---|
| Trigger a task | `POST {API_URL}/api/v1/tasks/{taskIdentifier}/trigger` with `{ payload, options: { idempotencyKey, … } }` | `Authorization: Bearer <secret key>` |
| Batch trigger | batch endpoint (see management API) | secret key |
| Retrieve / list / cancel / replay runs | `/api/v1/runs/…` | secret key |
| Env vars, schedules, waitpoint tokens | management API | secret key |
| Query / health report | `/api/v1/query`, `/api/v1/reports/health` | secret key (PATs rejected) |

`{API_URL}` = `TRIGGER_API_URL` if set, else `https://api.trigger.dev`. Templates read it from the environment and never inline it. Docs: [management/overview](https://trigger.dev/docs/management/overview), [management/authentication](https://trigger.dev/docs/management/authentication), [management/tasks/trigger](https://trigger.dev/docs/management/tasks/trigger).

## Sources
https://trigger.dev/docs/mcp-introduction · https://trigger.dev/docs/mcp-tools · https://trigger.dev/docs/cli-introduction · https://trigger.dev/docs/cli-deploy-commands · https://trigger.dev/docs/cli-env-commands · https://trigger.dev/docs/cli-runs-commands · https://trigger.dev/docs/cli-dev-commands · https://trigger.dev/docs/cli-login-commands · https://trigger.dev/docs/reports · https://trigger.dev/docs/deployment/dev-branches · https://trigger.dev/docs/github-actions · https://trigger.dev/docs/management/overview · https://code.claude.com/docs/en/mcp · github.com/triggerdotdev/trigger.dev `packages/cli-v3/src/mcp/schemas.ts`
