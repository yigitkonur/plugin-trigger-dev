# trigger-dev: Trigger.dev for Claude Code

A Claude Code plugin that makes the agent good at [Trigger.dev](https://trigger.dev): background jobs, scheduled pipelines, long workflows with waits and approvals, realtime progress UIs, and AI chat agents. It is not the official skills repackaged. It fingerprints your project, classifies what you are building, picks the primitive with a reason, links the doc behind every recommendation, and checks the code mechanically.

## Install

```
/plugin marketplace add yigitkonur/plugin-trigger-dev
/plugin install trigger-dev@plugin-trigger-dev
```

One step on Claude Code 2.1.275 or later: `/plugin install trigger-dev --marketplace yigitkonur/plugin-trigger-dev`.

**Install at project scope** (`--scope project`) for repos that use Trigger.dev. At user scope the three skill descriptions and the Trigger.dev MCP tool names load in every repository (about 900 tokens per `claude plugin details trigger-dev`); at project scope other repos pay nothing. Requires Claude Code 2.1.295 or later and Node 18 or later (for the edit checks, the prod guard and `audit`; without Node they skip silently).

## What you get

| Piece | What it does |
|---|---|
| `build` skill | Loads when the project uses Trigger.dev or you name it. Asks at most two questions the repo cannot answer, picks one of 13 scenario cards, verifies API names against the docs, and answers in a fixed shape: what you are building, why this primitive (and not that one), a minimal snippet, three pitfalls, doc links. |
| `chat-agent` skill | AI chat agents: eight invariants (including the ownership check the official skill omitted), a discovery tree, and ten playbooks keyed by situation. |
| `diagnose` skill | Symptom or run id to ranked causes, a first check with an explicit environment, and a short verdict from the read-only `run-investigator` agent. |
| `/trigger-dev:init` | Discovery, an architecture decision you confirm, setup with the human gates named, and a first run proven in dev. |
| `/trigger-dev:new` | Add one capability to an existing project and prove it runs. |
| `/trigger-dev:audit` | A rule catalog (stale APIs, silent-failure patterns, config, deploy, cost) run by a deterministic engine plus `code-auditor` agents; writes `trigger-audit/REPORT.md`; `--fix` applies only safe fixes. |
| `/trigger-dev:ship` | Preflight, the right CI or integration pipeline, an explicit `--env`, verification, rollback. |
| `/trigger-dev:doctor` | Checks Node, login, MCP, versions, duplicate official skills, self-host target and install scope. |
| Trigger.dev MCP server | The official server (`npx trigger.dev@latest mcp`), unchanged. |
| Hooks | Three, each tied to a failure. See below. |

## Hooks, and what they cost

Every hook is silent in a repository that does not use Trigger.dev. Details and the reasoning for each: [docs/design/05-steering-and-hooks.md](docs/design/05-steering-and-hooks.md).

| Hook | When | What it does | Cost |
|---|---|---|---|
| **H1** SessionStart | session start, resume, clear, compact | Injects about 400 characters of project facts: Trigger root and project ref, SDK/CLI versions and whether they match, package manager, frontend, Cloud or self-host, one line on environment defaults (the CLI defaults to prod, MCP project tools to dev), pinned docs path. Marks the project so the other hooks stay cheap elsewhere. In a git worktree it exports `TRIGGER_DEV_BRANCH` so parallel sessions do not split runs. | about 15 ms in other repos; about 75 ms in a Trigger.dev project |
| **H2** PostToolUse (Edit, Write) | after a file edit in a Trigger.dev project | Runs 14 high-precision rules (for example `Promise.all` around waits, `streamText` imported from `ai` inside `chat.agent`, `schedules.create` without a `deduplicationKey`, a secret key in client code, stale v3 imports) and tells the agent the fact and the fix with the doc link. Never blocks. | 7 ms in other repos; tens of ms in a Trigger.dev project; no output when clean |
| **H3** PreToolUse | `trigger deploy/promote/env set\|get\|pull/runs cancel\|replay` without `--env`, `npm run deploy:trigger`-style script aliases, MCP writes aimed at prod | Asks first, because the CLI defaults to prod. In `bypassPermissions` or `dontAsk` mode an implicit-prod command is denied with the fix (add `--env`). | a Node start (about 35 ms) only on those commands |

Set the **Steering level** option when you enable the plugin: `full` (default, all hooks), `quiet` (prod guard only), `off`.

## Design notes

- **Link, don't copy.** The plugin holds decisions, pitfalls and checks. API detail comes from the docs at the moment it is needed: the version-pinned copy in `node_modules/@trigger.dev/sdk/docs` first, then MCP `search_docs`, then `https://trigger.dev/docs/<path>.md`. `trigger-ctx docs <topic>` resolves a topic to the page.
- **Cloud first, self-host safe.** Nothing hard-codes `api.trigger.dev`; cloud-only advice is flagged and dropped on a self-hosted target.
- **Any stack.** TypeScript project, monorepo, polyglot repo (Python, Go, Ruby calling tasks over REST), or a caller-only app: detected, not assumed.
- **Beta features** (hosted webhooks, Slack/Linear connectors, channels) are never the default recommendation and always come with a non-beta fallback.
- The full design (overview, official-skills audit, architecture, hooks, flows, MCP vs CLI, doc index, walkthroughs, roadmap) is in [docs/design](docs/design/00-overview.md). Where the build differs from the design, [docs/spikes.md](docs/spikes.md) says so.

## Does it help? Measured, with caveats

A 31-case eval suite (`evals/`, run with `claude plugin eval`) compares three arms on the same prompts: this plugin, no plugin, and the six official `triggerdotdev/skills`. On the 25 positive cases the plugin scored 0.98, no plugin 0.53, the official skills 0.59; on the 6 negative cases (Celery, Sidekiq, BullMQ, plain cron, where it must stay out of the way) all arms score 1.00. Two runs per case, a small-model judge, and graders written by the plugin's author, so read it as a regression suite with a baseline rather than an independent benchmark. Numbers per family, the places it falls short (`tasks-ui-integrations` is only +0.08 over the official skills) and the fixes the evals forced: [docs/spikes.md](docs/spikes.md), items 19 and 20.

## The engine

`bin/trigger-ctx` (on the Bash tool's PATH) is a zero-dependency Node script: `detect`, `guard`, `lint`, `scan`, `docs`, `links-check`. It always exits 0. The 134-rule catalog is data: [references/rule-catalog.md](references/rule-catalog.md).

## Windows

The session fingerprint and edit checks are shell-form hooks and need Git Bash (Git for Windows). Without it they fail without blocking anything (`onFailure: continue`), and the prod guard, which runs as plain Node, still works.

## Develop

```
node tests/rules.test.mjs        # every rule hits its bad examples and stays silent on its good ones
node tests/replay.test.mjs       # hook outputs equal what real Claude Code sessions recorded
node scripts/rules/build.mjs     # scripts/rules/src/* -> rules.json, then render-catalog.mjs
node scripts/build-hooks.mjs     # regenerate hooks/hooks.json (CI runs --check)
claude plugin validate --strict .
```

See [AGENTS.md](AGENTS.md) for maintainer rules. MIT licensed.
