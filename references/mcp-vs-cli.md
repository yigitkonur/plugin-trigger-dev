# MCP vs CLI vs REST: which to use, and what to do when one is missing

The Trigger.dev MCP server (`npx trigger.dev@latest mcp`, shipped by this plugin) is for **live account and run data**. The `trigger.dev` CLI is for **project lifecycle with flags**. REST is for callers with no Node. Tool list: https://trigger.dev/docs/mcp-tools · CLI: https://trigger.dev/docs/cli-introduction.

## Rules that never bend

1. **Always pass the environment.** MCP project tools default to `dev`; CLI `deploy`, `promote`, `env *`, `runs *` and `report` default to `prod`; MCP `deploy` and `list_deploys` default to `prod`. "Is prod healthy?" answered from dev data is the classic mistake.
2. **Monorepos:** pass `configPath` (and `projectRef`) to every MCP project tool, from the session fingerprint. Run CLI commands from the directory holding `trigger.config.*`, or pass `--config`.
3. **Which CLI:** version-sensitive commands (`dev`, `deploy`, `update`) use the project's own devDependency (`pnpm exec trigger …`, `npx trigger …`, or the package.json script). `npx trigger.dev@latest` is for commands that don't build code (login, whoami, env, runs, projects) or repos without a devDependency. CI fails when the CLI and `@trigger.dev/*` versions differ (https://trigger.dev/docs/github-actions).
4. **Never trust tool annotations for safety.** `start_dev_server`, `stop_dev_server` and `switch_profile` are annotated read-only but start a process or change state.

## Decision matrix

| Need | Primary | Fallback (in order) |
|---|---|---|
| Look up an API | local pinned `.mdx` → MCP `search_docs` (no login) → web `.md` (`trigger-ctx docs <topic>`) | `https://trigger.dev/docs/llms.txt` |
| Log in | CLI resumable login: `login --no-browser --no-wait`, the user approves in a browser, then `login --no-browser` | none; a human step |
| Which account / API URL | MCP `whoami` | CLI `whoami` |
| Create or choose a project | MCP `list_orgs` / `list_projects`; CLI `projects create` | dashboard |
| Initialise a repo | CLI `init -y --project-ref … --runtime …` from the package directory | MCP `initialize_project`; manual setup (https://trigger.dev/docs/manual-setup) |
| Start dev | MCP `start_dev_server` (waits up to 30 s) then `dev_server_status` for logs. It takes only `configPath`: **in a linked git worktree use CLI `dev --branch <name>`** | CLI `dev` in the background |
| List registered tasks and payload schemas | MCP `get_current_worker` (explicit environment) | dev server output; dashboard. There is no `get_tasks` tool |
| Trigger a test run | MCP `trigger_task` (`environment: "dev"`) | SDK script; REST trigger; dashboard Test |
| Inspect a run | MCP `get_run_details` (via `run-investigator`), `get_span_details` for one span | CLI `runs get` (no trace); dashboard |
| Wait for a run | MCP `wait_for_run_to_complete` | poll `get_run_details` |
| Health, "is prod OK" | MCP `get_report` with `key: "health"` and an explicit environment | CLI `report health --env prod`; REST `/api/v1/reports/health` |
| Metrics, cost, memory, 429s | MCP `get_query_schema` then `query` (TRQL) | REST `/api/v1/query` (secret key; PATs are rejected); dashboard Query page |
| Deploy | **CLI** `deploy --env <e>` (`--external-id`, `--dry-run`, `--native-build`) | MCP `deploy` with explicit `environment` |
| Roll back | CLI `promote <version> --env <e>` | dashboard |
| Environment variables | CLI `env list/get/set/pull --env <e>` (no dev target) | dashboard; REST; the `syncEnvVars` extension |
| Preview branches | CLI `deploy --env preview`, `preview archive`; MCP `list_preview_branches` | dashboard |
| Replay or cancel runs | MCP `replay_run` / `cancel_run`; bulk: dashboard | CLI `runs replay/cancel --env <e>` (`-y` in CI) |
| Chat-agent smoke test | MCP `list_agents` → `start_agent_chat` → `send_agent_message` → `close_agent_chat` (never prod without asking) | `mockChatAgent` (https://trigger.dev/docs/ai-chat/testing) |
| Webhooks (beta) | MCP webhook tools (list/get endpoints and deliveries) | REST webhooks API; dashboard |
| Alerts, billing limits, API-key presets, buying concurrency | **dashboard (a human)** | none |

## Environment-default traps

| Surface | Default | Trap |
|---|---|---|
| CLI `deploy`, `promote` | prod | "deploy this" ships to production |
| CLI `env list/get/set/pull` | prod | `env pull` writes **prod secrets** into `.env.local`; `--show-values` and `get` print them |
| CLI `runs cancel/replay` | prod | cancels a live run |
| CLI `report`, `runs list/get` | prod | read-only; wrong data if you meant dev |
| package.json scripts such as `"deploy:trigger": "trigger deploy"` | prod | the alias hides the default |
| MCP project tools | dev | answers about prod from dev data |
| MCP `deploy`, `list_deploys` | prod | an omitted `environment` means production |
| MCP prompt overrides | the call's `environment` | change live LLM behaviour without a deploy |
| SDK in app code | from the key prefix (`tr_dev_`, `tr_prod_`, …) | wrong key means wrong environment, or runs stuck in PENDING_VERSION |

The plugin's prod guard (hook H3) asks before the implicit-prod CLI calls above and before MCP writes aimed at prod.

## When something isn't available

| Situation | Behaviour |
|---|---|
| **Not logged in** | Only `search_docs`, `list_profiles`, `dev_server_status` and `stop_dev_server` work. Offer the resumable login (a human approves in the browser). Never create an account for the user. |
| **No Node / npx** | MCP and CLI are both down. Give static guidance plus the REST API with the secret key. Writing tasks needs Node: say so and point to https://trigger.dev/docs/quick-start. The hooks skip silently. |
| **MCP server failed to start** | Use the CLI equivalents above; docs from the local pinned `.mdx`, then the web `.md`. |
| **Offline** | Local pinned docs and the plugin's own decisions only; say the live checks were skipped. |
| **Self-host** (`TRIGGER_API_URL` or a non-default profile URL) | CLI and MCP work through the profile. The REST base comes from `TRIGGER_API_URL`. Drop or flag cloud-only advice: API-key presets, plan limits, GitHub/Vercel integrations, private networking, billing limits. Chat agents need `OBJECT_STORE_*` for snapshots. |
| **User runs the server with `--readonly`** | Write tools are absent: use the CLI for writes (still guarded). |
| **User runs the server with `--dev-only`** | `deploy` and `list_preview_branches` are absent: use the CLI for staging and prod. |
| **No webhooks beta access** | Own route plus `tasks.trigger` with the provider event id as `idempotencyKey`. |
| **Project's CLI older than `@latest`** | Lifecycle commands go through the project's own CLI. |

## REST (callers with no Node, and polyglot backends)

| Need | Endpoint | Auth |
|---|---|---|
| Trigger a task | `POST {API_URL}/api/v1/tasks/{taskIdentifier}/trigger` with `{ "payload": …, "options": { "idempotencyKey": … } }` | `Authorization: Bearer <secret key>` |
| Runs, schedules, env vars, waitpoint tokens | management API | secret key |
| Query, health report | `/api/v1/query`, `/api/v1/reports/health` | secret key (PATs rejected) |

`{API_URL}` is `TRIGGER_API_URL` when set; otherwise the Cloud default. Templates read it from the environment and never inline it. Docs: https://trigger.dev/docs/management/overview · https://trigger.dev/docs/management/authentication · https://trigger.dev/docs/management/tasks/trigger.
