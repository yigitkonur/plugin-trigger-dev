---
name: new
description: Add one capability to an existing Trigger.dev project (a task, a schedule, a progress UI, an approval step, a webhook handler) and prove it runs.
argument-hint: "<capability, e.g. progress bar for the import task>"
disable-model-invocation: true
allowed-tools: Bash(trigger-ctx *) Bash(node *trigger-ctx.mjs *)
---

# Add a capability

Capability requested: $ARGUMENTS

## Project facts

!`trigger-ctx detect --brief || true`

(If the block is empty, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs" detect --brief` yourself.)

## Procedure

This is `init` without the setup: the project already has Trigger.dev. If it does not (no root, SDK not installed), stop and suggest `/trigger-dev:init`. If the SDK is 3.x, read `${CLAUDE_PLUGIN_ROOT}/skills/build/scenarios/migrate-v2-v3.md` first.

1. **Classify** the request into one card from the table in `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` (a chat or AI-assistant request goes to the `chat-agent` skill). Read only that card.
2. **Discover** with `${CLAUDE_PLUGIN_ROOT}/skills/build/discovery.md`: ask only what the facts and the request leave open, at most two questions, and state every assumption.
3. **Decide** in at most 15 lines: primitives, one line of why each, a doc link per primitive, the files you will touch. The user confirms before you write.
4. **Build.** Verify every API name with `trigger-ctx docs <topic>` before writing it. Follow the build invariants. Reuse the existing task layout (`dirs`), naming and package manager. A new call site is a type-only `tasks.trigger`, or a REST call in the host language.
5. **Prove it.** MCP `start_dev_server` (its `configPath` is the project directory, not the file; or `trigger dev --branch <name>` in a linked git worktree), `get_current_worker` with `environment: "dev"` lists the new task, `trigger_task` with `environment: "dev"`, then `wait_for_run_to_complete`. Show status, output and the dashboard link. A failure goes to `get_run_details` and the `diagnose` skill, not to blind retries.
6. **Hand off.** Say what changed. Mention `/trigger-dev:ship` if it should go live. Done means a run reached COMPLETED; if you could not run it, say UNVERIFIED and why.
