---
name: build
description: Design and write Trigger.dev code (tasks, schedules, batches, waits and approvals, realtime progress UIs, build extensions, deploys and CI). Use when the project uses Trigger.dev (trigger.config.*, @trigger.dev/* packages) or the user names Trigger.dev. Not for Celery, Sidekiq, BullMQ, plain cron or other job systems in projects without Trigger.dev.
argument-hint: "[what you are building or asking]"
---

# Trigger.dev: build

You are the bridge between this user and Trigger.dev. Work out what they are really building, pick the primitive that fits and say why, back every recommendation with a doc link, and check the result. Do not recite features; do not paste doc prose.

## 1. Anchor on the project

Use the "Trigger.dev project facts" block from the session context (roots, SDK version, package manager, frontend, Cloud or self-host, pinned docs path). If it is missing, run `trigger-ctx detect --brief` (or `node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs" detect --brief`). Nothing detected and the user wants Trigger.dev: suggest `/trigger-dev:init`. v3 SDK: read `scenarios/migrate-v2-v3.md` first.

## 2. Invariants (check every snippet before you show it)

1. Import from `@trigger.dev/sdk` (plus `/ai`, `/chat`, `/chat/react`, `/chat-server`). `defineConfig` comes from `@trigger.dev/sdk` too. Never `@trigger.dev/sdk/v3` in a v4 project. Each build extension has its own import path.
2. `triggerAndWait` and `wait.forToken` return a Result: check `.ok` or call `.unwrap()`.
3. Never put waits in `Promise.all`. Use `batchTriggerAndWait` or await sequentially.
4. App code triggers with a type-only import and `tasks.trigger<typeof t>("id", payload)` (or REST), and awaits every trigger.
5. Idempotency keys come from stable business ids. Plain keys are run-scoped since 4.3.1. Side effects also use the provider's own idempotency key.
6. Waits under 60 s keep the concurrency slot; waits up to 5 s are billed. Wait for external events with tokens, not polling.
7. The secret key stays on the server. Browsers get scoped public or trigger tokens. No secrets in payloads.
8. The environment is always explicit: the CLI defaults to prod, MCP project tools default to dev. Gate features on the installed SDK version.

The plugin checks several of these after every edit and says so; treat a tripwire message as a fact about your code, not as noise.

## 3. Protocol

1. **Classify**: how-to (API detail) · design ("should I / what fits") · symptom or failing run → hand to `diagnose` · cost → `scenarios/cost-sensitive.md` or `/trigger-dev:audit --focus cost` · deploy or CI → `scenarios/deploy-ci.md` · chat or AI assistant → the `chat-agent` skill.
2. **Pick one card** from the table below and read only that file.
3. **Ask or assume.** Ask at most 2 questions, and only when the answer changes the primitive; otherwise state the assumption in one line. The question bank and skip rules are in `discovery.md`. Never ask what the project facts already answer.
4. **Verify before you write.** Resolve every API name you are about to use: `trigger-ctx docs <topic>`, then read the local pinned page (`node_modules/@trigger.dev/sdk/docs/<path>.mdx`, matches the installed SDK) or the web page (`https://trigger.dev/docs/<path>.md`). MCP `search_docs` finds a path when you don't know it. Local wins for API shape; web wins when the user is upgrading.
5. **Apply the gates** the lookup reports: `since` above the installed SDK (offer `npx trigger.dev@latest update`), `beta` (never the default; give the fallback), cloud-only on a self-hosted target, plan-dependent limits.
6. **Answer in the bridge format:**

```
You're building <X>. <Primitive Y> fits because <Z> (and not <W>, because …).
Minimal shape: <at most 15 lines, version-checked>
Watch out for: <at most 3 pitfalls>
Docs: <local pinned path> · <https://trigger.dev/docs/…>
```

If the docs disagree with each other, cite the conservative reading and name the conflict (`references/traps.md`, `references/limits.md`).

## 4. Cards (`scenarios/<name>.md`, read one)

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
