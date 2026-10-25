# trigger-dev: trigger.dev for claude code and codex

tl;dr: a claude code (and codex) plugin that makes the agent actually good at [trigger.dev](https://trigger.dev). that means background jobs, cron pipelines, long workflows with waits and approvals, realtime progress uis and ai chat agents. it's not the official skills with a new label. it fingerprints your project, figures out what you're building, picks the right primitive and says why, links the doc behind every call it makes, and checks the code while it's being written.

<!-- kit:install:start -->
## install

Every plugin of ours is installed **once, globally, and off**, then **turned on per project**. Nothing runs and no tokens are spent in chats that don't switch it on. It works the same in Claude Code and Codex.

### 1. install it globally

**Claude Code**

```sh
claude plugin marketplace add yigitkonur/plugin-trigger-dev
claude plugin install trigger-dev@plugin-trigger-dev -s user          # stays off: defaultEnabled is false in the manifest
```

**Codex** (0.163+)

```sh
codex plugin marketplace add yigitkonur/plugin-trigger-dev
codex plugin add trigger-dev@plugin-trigger-dev
codex-plugin-project.sh global-off trigger-dev@plugin-trigger-dev     # Codex has no enable/disable command; this keeps it off everywhere
```

All our plugins, both hosts, plus the `plugin` command and the 6-hourly update job, in one line:

```sh
curl -fsSL https://raw.githubusercontent.com/yigitkonur/plugin-kit/main/install.sh | sh -s -- --all
```

### 2. turn it on in a project

```sh
cd your-project
plugin on trigger-dev    # Claude Code and Codex, this folder only
plugin off trigger-dev   # undo
plugin                   # or pick from a list (TUI)
```

By hand, without the `plugin` command:

```sh
claude plugin enable trigger-dev@plugin-trigger-dev --scope project      # undo: claude plugin disable trigger-dev@plugin-trigger-dev --scope project
codex-plugin-project.sh on trigger-dev@plugin-trigger-dev . --trust      # undo: codex-plugin-project.sh off trigger-dev@plugin-trigger-dev
```

Restart `claude` / `codex` in that folder afterwards.
Codex reads a folder's `.codex/config.toml` only when the folder is trusted; `--trust` adds that, and it also enables the folder's hooks and rules, so use it for your own projects only. `plugin` and `codex-plugin-project.sh` come from [plugin-kit](https://github.com/yigitkonur/plugin-kit) (the one-line installer above).

### 3. updates

A plugin updates only when its `version` changes, and this repo's `release` workflow bumps it on every shipped change. Machines pick it up with `plugin update`, or by themselves with the 6-hourly job (`plugin autoupdate install`). By hand:

```sh
claude plugin marketplace update plugin-trigger-dev && claude plugin update trigger-dev@plugin-trigger-dev
codex plugin marketplace upgrade plugin-trigger-dev        # then start a new session
```

No GitHub SSH key on the machine? `export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` (`plugin install` sets it in Claude's settings for you).

### 4. uninstall

```sh
claude plugin uninstall trigger-dev@plugin-trigger-dev -s user
claude plugin marketplace remove plugin-trigger-dev
codex plugin remove trigger-dev@plugin-trigger-dev
codex plugin marketplace remove plugin-trigger-dev
```
<!-- kit:install:end -->

### what you can expect

checked live through herdr on claude code 2.1.307: with it off a fresh session lists no `trigger-dev:` skills; after the project switch and `/reload-plugins` the session reloaded with the plugin's skills, hooks and mcp server (20 skills, 20 hooks, 1 mcp server vs 12 skills, 3 hooks, 0 mcp when off); switched off again, a fresh session lists none. the project switch only touches that folder's `.claude/settings.json`.

at user scope the four skill descriptions and the trigger.dev mcp tool names would load in every repo you open, about 1,000 tokens per `claude plugin details trigger-dev`. that is why it stays off globally and only the projects that use trigger.dev switch it on.

### needs and steering

**needs:** claude code 2.1.295 or later, and node 18 or later. node runs the edit checks, the prod guard and `audit`; without it they skip quietly.

**steering level** (run `/plugin configure trigger-dev@plugin-trigger-dev`, or pass `--config steering=quiet` when installing by hand): `full` is the default and runs every hook, `quiet` keeps only the prod guard, `off` turns the hooks off.

### staying in sync with trigger.dev itself

trigger.dev ships every few days, so a weekly job (github actions plus an optional local launchd job, `scripts/maintenance/install-weekly.sh`) compares the newest sdk, cli, mcp tools and release notes with what the plugin was last checked against (`references/upstream.json`) and says what changed and which files it touches. how that loop works is in [AGENTS.md](AGENTS.md#keeping-up-with-upstream). the plugin itself always installs and recommends the latest version, never a pin.

### in codex

same repo, same skills, same version. the codex copy has the skills, the official mcp server (`trigger.<tool>`), the session facts, the edit tripwire (it reads `apply_patch`) and the prod guard. it has no plugin agents (codex has none), so the audit and diagnose steps that use them run inline. checked live on codex-cli 0.163.0: the guard blocked `npx trigger.dev@latest deploy` with no `--env`, the tripwire named `handleError` in an `apply_patch`, and `trigger.search_docs` returned docs.

the first time codex loads the plugin's hooks it asks you to review them (tui: "hooks need review", trust all). `codex plugin list` says `installed, enabled` in the project and `installed, disabled` elsewhere.

## what you get

| piece | what it does |
|---|---|
| `build` skill | loads when you edit task code in a trigger.dev project or say "trigger.dev". asks at most two questions the repo can't answer, picks one of 13 scenario cards, and checks api names against the installed sdk's types and the pinned docs (`trigger-ctx docs catchError` tells you if a name exists and if the types mark it `@deprecated`). answers in a fixed shape: what you're building, why this primitive and not that one, a minimal snippet, three pitfalls, doc links. then it tries to prove the code with a dev run (or a typecheck), or says UNVERIFIED and why. |
| `chat-agent` skill | ai chat agents: eight invariants (including the ownership check the official skill leaves out), a discovery tree, and ten playbooks keyed by situation. |
| `diagnose` skill | symptom or run id → ranked causes, a first check with an explicit environment, and a short verdict from the read-only `run-investigator` agent. never invents run data. |
| `ship` skill / `/trigger-dev:ship` | deploys the trigger.dev tasks: preflight, the right ci or integration pipeline, an explicit `--env`, verification, rollback. also loads when you just say "deploy the jobs to staging" (not for deploying the app itself). |
| `/trigger-dev:init` | discovery, an architecture decision you confirm, setup with the human gates named, and a first run proven in dev. |
| `/trigger-dev:new` | adds one capability to an existing project and proves it runs. |
| `/trigger-dev:audit` | a rule catalog (stale apis, silent-failure patterns, config, deploy, cost) run by a deterministic engine plus `code-auditor` agents. writes `trigger-audit/REPORT.md`; `--fix` only applies the safe fixes. |
| `/trigger-dev:doctor` | checks node, login, mcp, versions, duplicate official skills, self-host target and install scope. |
| trigger.dev mcp server | the official one (`npx trigger.dev@latest mcp`), untouched. |
| hooks | three, each tied to a real failure. see below. |

## hooks, and what they cost

every hook stays silent in a repo that doesn't use trigger.dev. the reasoning for each one lives in [docs/design/05-steering-and-hooks.md](docs/design/05-steering-and-hooks.md).

| hook | when | what it does | cost |
|---|---|---|---|
| **H1** SessionStart | session start, resume, clear, compact | drops about 400 characters of project facts into context: trigger root and project ref, sdk/cli versions and whether they match, package manager, frontend, cloud or self-host, one line on environment defaults (the cli defaults to prod, mcp project tools to dev), and the pinned docs path. marks the project so the other hooks stay cheap everywhere else. in a git worktree it exports `TRIGGER_DEV_BRANCH` so parallel sessions don't split runs. | about 15 ms in other repos; about 75 ms in a trigger.dev project |
| **H2** PostToolUse (Edit, Write) | after a file edit in a trigger.dev project | runs 15 rules picked for a low false-positive risk, for example `Promise.all` around waits, `streamText` imported from `ai` inside `chat.agent`, `schedules.create` without a `deduplicationKey`, a secret key in client code, stale v3 imports, and task options the 4.7 types mark `@deprecated` (see "evidence" below). it tells the agent the fact and the fix with the doc link. after an `Edit` it keeps hits in the lines you just wrote apart from hits that were already in the file. never blocks. | roughly 10 ms in other repos (shell only, plus one cheap signal check when no marker exists yet); tens of ms in a trigger.dev project; zero output when clean |
| **H3** PreToolUse | `trigger deploy/promote/env set\|get\|pull/runs cancel\|replay` without `--env`, `npm run deploy:trigger`-style script aliases, mcp writes aimed at prod | asks first, because the cli defaults to prod. in `bypassPermissions` or `dontAsk` mode an implicit-prod command gets denied with the fix (add `--env`). | one node start (about 35 ms), only on those commands |

**evidence for H2.** every hook rule hits its bad examples and stays silent on its good ones (`tests/rules.test.mjs`, 278 examples). a scan of 60 public repos (31,032 files: 42 with the sdk in the root `package.json`, 18 with it only in a nested package) exercised three of the 15 rules:
- MIG-01 had 59 hits, all true (real `@trigger.dev/sdk/v3` imports in sdk 4 projects).
- MIG-02 had 3, all true.
- MIG-03 had 3: two true, one false (a test mock with an `init:` key), which is why the rule now skips test files.

the other 12 rules had no hits to judge, so their precision on real code is unmeasured. no cap. details: [docs/spikes.md](docs/spikes.md), spike S9 and item 23.

## design notes

- **link, don't copy.** the plugin holds decisions, pitfalls and checks. api detail comes from the docs right when it's needed: the version-pinned copy in `node_modules/@trigger.dev/sdk/docs` first, then mcp `search_docs`, then `https://trigger.dev/docs/<path>.md`. `trigger-ctx docs <topic or name>` points at the page (and, for a name, at the sdk's own types).
- **cloud first, self-host safe.** nothing hard-codes `api.trigger.dev`; cloud-only advice is flagged and dropped on a self-hosted target.
- **any stack.** typescript project, monorepo, polyglot repo (python, go, ruby calling tasks over rest), or a caller-only app: detected, not assumed.
- **always the latest.** the plugin tracks the newest trigger.dev release and never pins a version in what it installs or recommends; a beta feature (none right now, hosted webhooks and the slack/linear connectors went ga in 4.8.0) is never the default and always comes with a stable fallback. see [AGENTS.md](AGENTS.md#keeping-up-with-upstream) for how upstream changes are found and applied.
- the full design (overview, official-skills audit, architecture, hooks, flows, mcp vs cli, doc index, walkthroughs, roadmap) is in [docs/design](docs/design/00-overview.md). wherever the build differs from the design, [docs/spikes.md](docs/spikes.md) says so.

## does it actually help? measured, with caveats

a 49-case eval suite (`evals/`, run with `claude plugin eval`, three runs per case) puts three arms on the same prompts: this plugin, no plugin, and the six official `triggerdotdev/skills`.
- **original positive cases (25):** the plugin scored 0.98 (0.976), no plugin 0.55, the official skills 0.62. the plugin arm was re-run for 0.2.0; the other two arms are from the first full run, since the plugin's edits don't touch them.
- **negative cases (6)** (celery, sidekiq, bullmq, plain cron, where it has to stay out of the way): 1.00 in every arm.

the gain isn't uniform, and that's the point.
- **big where the plugin steers:** chat agents +0.64 over the official skills, `init` discovery +0.73, cost +0.67, live diagnosis +0.67.
- **zero where the model already knows the api:** realtime, webhooks, migration and rest-caller prompts tie at 1.00 in both arms.
- **overall:** across the original 42 cases the plugin is about +0.29 over no plugin, and unchanged within noise from 0.1.1 (0.986 vs 0.990).

seven "steering-hard" cases came in with 0.2.0 to test what the first suite couldn't see: deprecated hook names, a task file with an old import, a deploy request that never names the skill, and running a check before claiming success. on 0.1.1 they scored 0.33 to 1.00 per case, with four clearly red. on 0.2.0 six of the seven score 1.00, and one sits at 0.83.

ngl, the plugin's author wrote the cases and graders and a small model judges them. treat this as a regression suite with baselines, not an independent benchmark; a single case can swing by one run in three. details, the misses and the fixes the evals forced: [docs/spikes.md](docs/spikes.md), items 19, 20 and 23.

## the engine

`bin/trigger-ctx` (on the bash tool's PATH) is a zero-dependency node script: `detect`, `guard`, `lint`, `scan`, `docs`, `links-check`. it always exits 0. the 135-rule catalog is data: [references/rule-catalog.md](references/rule-catalog.md).

## windows

the session fingerprint and the edit checks are shell-form hooks and need git bash (git for windows). without it they fail without blocking anything (`onFailure: continue`). the prod guard runs as plain node and still works. windows without git bash is untested.

## known limits

- the prod guard sees the cli, `package.json` scripts and mcp, not makefiles or shell scripts.
- the deploy preflight and the prove-it step are steered, not enforced. in live sessions the agent sometimes skips the `trigger-ctx scan` or the typecheck and goes straight to the deploy or the dev run.
- `.mcp.json` runs `npx trigger.dev@latest mcp` on purpose (same as trigger.dev's own config); a weekly job diffs its tool list.

## develop

```sh
node tests/rules.test.mjs        # every rule hits its bad examples and stays silent on its good ones
node tests/replay.test.mjs       # hook outputs equal what real claude code sessions recorded
node tests/marker.test.mjs       # the tripwire arms in non-ascii paths and in the session that creates the project
node scripts/rules/build.mjs     # scripts/rules/src/* -> rules.json, then render-catalog.mjs
node scripts/build-hooks.mjs     # regenerate hooks/hooks.json (ci runs --check)
claude plugin validate --strict .
```

maintainer rules live in [AGENTS.md](AGENTS.md). mit licensed.
