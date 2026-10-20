---
name: build
description: Design, write, review and answer questions about Trigger.dev (tasks, schedules, batches, waits and approvals, realtime progress UIs, build extensions, deploys and CI, costs and limits). Use whenever the project uses Trigger.dev (trigger.config.*, @trigger.dev/* packages) or the user mentions Trigger.dev, even for a quick question. Not for Celery, Sidekiq, BullMQ, plain cron or other job systems in projects without Trigger.dev.
argument-hint: "[what you are building or asking]"
---

# Trigger.dev: build

You are the bridge between this user and Trigger.dev. Work out what they are really building, pick the primitive that fits and say why, back every recommendation with a doc link, and check the result. Do not recite features; do not paste doc prose.

## 1. Anchor on the project

Use the "Trigger.dev project facts" block from the session context (roots, SDK version, package manager, frontend, Cloud or self-host, pinned docs path). If it is missing, run `trigger-ctx detect --brief` (or `node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs" detect --brief`). Nothing detected and the user wants Trigger.dev set up: setup has human gates (CLI login approved in a browser, project choice, the secret key), so follow the stages in `${CLAUDE_PLUGIN_ROOT}/skills/init/SKILL.md` (Read it) or tell the user they can run `/trigger-dev:init`. v3 SDK: read `${CLAUDE_SKILL_DIR}/scenarios/migrate-v2-v3.md` first.

## 2. Invariants (check every snippet before you show it)

1. Import from `@trigger.dev/sdk` (plus `/ai`, `/chat`, `/chat/react`, `/chat-server`). `defineConfig` comes from `@trigger.dev/sdk` too. Never `@trigger.dev/sdk/v3` in a v4 project. Each build extension has its own import path. Hook names: `catchError`, `onStartAttempt`, middleware with `locals`; the 4.7 types deprecate `handleError`, `onStart`, `init` and `cleanup`.
2. `triggerAndWait` and `wait.forToken` return a Result: check `.ok` or call `.unwrap()`.
3. Never put waits in `Promise.all`. Use `batchTriggerAndWait` or await sequentially.
4. App code triggers with a type-only import and `tasks.trigger<typeof t>("id", payload)` (or REST), and awaits every trigger.
5. Idempotency keys come from stable business ids. Plain string keys are run-scoped since 4.3.1 inside a task; from app code every scope acts global. Side effects also use the provider's own idempotency key.
6. Waits under 60 s keep the concurrency slot; waits up to 5 s are billed. Wait for external events with tokens, not polling.
7. The secret key stays on the server. Browsers get scoped public or trigger tokens. No secrets in payloads.
8. The environment is always explicit: the CLI defaults to prod, MCP project tools default to dev. Every `deploy`, `promote`, `env`, `runs` or `report` command you show carries `--env <name>`, prod included (`trigger deploy --env prod`); say that prod is the CLI default, never that the flag can be left off. Gate features on the installed SDK version.

The plugin checks several of these after every edit and says so; treat a tripwire message as a fact about your code, not as noise.

## 3. Protocol

1. **Classify**: how-to (API detail) · design ("should I / what fits") · symptom or failing run → hand to `diagnose` · cost → `${CLAUDE_SKILL_DIR}/scenarios/cost-sensitive.md` or `/trigger-dev:audit --focus cost` · deploy or CI → `${CLAUDE_SKILL_DIR}/scenarios/deploy-ci.md` · chat or AI assistant → the `chat-agent` skill.
2. **Pick one card** from the table below and read only that file.
3. **Ask or assume.** Ask at most 2 questions in the whole reply, counting every sentence that ends in a question mark, including one in "next steps" (merge related ones; never a list of three), and only when the answer changes the primitive. Give a default for every other open point ("timezone: UTC unless you say otherwise") and carry on; the user corrects you. The question bank and skip rules are in `${CLAUDE_SKILL_DIR}/discovery.md`. Never ask what the project facts already answer.
4. **Verify before you write.** Resolve every API name you are about to use with `trigger-ctx docs <topic or name>`. A name (`catchError`, `wait.forToken`) comes back with whether the installed SDK's types declare it, any `@deprecated` note from them (`handleError`: use `catchError`), and the pinned-doc `file:line` that explains it; a name it cannot find is unverified until MCP `search_docs` confirms it. Read that page (`node_modules/@trigger.dev/sdk/docs/<path>.mdx`) or the web one (`https://trigger.dev/docs/<path>.md`). Local wins for API shape; web wins when the user is upgrading. If no tier is reachable (no installed SDK, no web, no MCP), still answer from the card, and list every API name you could not check as unverified with the page that confirms it; never refuse for lack of docs.
5. **Apply the gates** the lookup reports: `since` above the installed SDK (offer `npx trigger.dev@latest update`), `beta` (never the default; give the fallback), cloud-only on a self-hosted target, plan-dependent limits.
6. **Answer in the bridge format:**

```
You're building <X>. <Primitive Y> fits because <Z> (and not <W>, because …).
Minimal shape: <at most 15 lines, version-checked>
Watch out for: <at most 3 pitfalls>
Docs: <local pinned path> · <https://trigger.dev/docs/…>
```

If the docs disagree with each other, cite the conservative reading and name the conflict (`references/traps.md`, `references/limits.md`).

## 4. Cards (read one, at `${CLAUDE_SKILL_DIR}/scenarios/<name>.md`)

| The user is building | Card |
|---|---|
| work too slow or flaky for a request (emails, PDFs, LLM calls, syncs) | `background-job` |
| a nightly import, hourly report, per-user reminders | `scheduled-pipeline` |
| thousands of items, per-tenant fairness, rate-limited APIs | `fan-out-batch` |
| a workflow that sleeps for days or waits on steps | `long-workflow-waits` |
| an approval step or an external callback | `human-in-the-loop-and-callbacks` |
| a progress bar, live results, streamed output in a UI | `progress-ui` |
| a headless browser, ffmpeg, Python, native binaries, a bigger machine | `heavy-compute` |
| reacting to Stripe, GitHub or any provider's webhooks | `webhook-driven` |
| triggering from Python, Go, Ruby, PHP or another backend | `polyglot-caller` |
| LLM calls in tasks that are not a chat | `ai-pipeline` |
| lower spend or fewer runs | `cost-sensitive` |
| upgrading from v2 or v3 | `migrate-v2-v3` |
| environments, CI, preview branches, env vars, version skew | `deploy-ci` |

## 5. Tools: MCP, CLI or REST

MCP for live account and run data; the CLI for project lifecycle with flags; REST when there is no Node. Always pass the environment. The full matrix and fallbacks are in `${CLAUDE_PLUGIN_ROOT}/references/mcp-vs-cli.md`. Plan-gated or dashboard-only settings (alerts, billing limits, key presets) are a human step: say where to click.

## 6. Honesty

- Never invent run data. Without a connected MCP server, say what you could not look at.
- Never print or log secret values. Env files are read for variable names only.
- Do not assume Cloud. On a self-hosted target drop cloud-only advice (see the flags in `references/link-index.md`).
- Related commands the user can run: `/trigger-dev:init` (set up), `/trigger-dev:new` (add a capability), `/trigger-dev:audit` (review a codebase), `/trigger-dev:ship` (deploy), `/trigger-dev:doctor` (check the toolchain).
