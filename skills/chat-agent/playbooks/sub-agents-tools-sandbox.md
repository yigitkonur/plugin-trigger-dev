# Sub-agents, tools and code sandboxes (`chat-agent/sub-agents-tools-sandbox`)

**Use when:** the agent delegates to another agent, runs model-written code, bundles skill scripts, or tool results bloat later turns.  **Not this playbook if:** the question is approvals (`approvals-and-questions`), payload size alone (`long-conversations`), or the route itself (`greenfield`, `migrate-route-handler`).

**Decide:**
- `AgentChat` sub-agent when the work is its own conversation; plain tool when one call suffices.
- Single-turn sub-agent when one call finishes the job; keyed multi-turn (`conversationId`) only when the parent must continue it.
- Skill when the capability is developer-written instructions plus scripts; skills run unsandboxed in the worker container, so never for model-written code.
- Hosted code sandbox (e.g. E2B) when the model writes code; never run it on the worker host.
- Named `concurrencyLimit` with `perKey` when sub-agents run in parallel; the per-session override lasts 7 days by default.
- Side channel when out-of-band frames or progress must stream beside the transcript.

**Order of work:**
1. Declare every tool, with its `toModelOutput`, on `chat.agent({ tools })`.
2. Make the sub-agent a `chat.agent` and call it through `AgentChat`, with a server-derived `conversationId`.
3. Cap parallelism per session with `concurrencyLimit`, `perKey`, `concurrencyKey` in `triggerConfig`, and `concurrencyLimits.override`.
4. Define skills with `skills.define` and `.local()` at module scope; attach them with `chat.skills.set` in `onBoot`.
5. Sandbox: warm in `onTurnStart` without blocking; keep the run id in `chat.local` (initialised in `onBoot`); dispose in `onChatSuspend`, with `onComplete` as the safety net.
6. Close sub-agents when the parent exits (`chat.close`, in `onComplete` or at the end of a custom loop).

**Invariants:**
- Token and start-session actions check that the signed-in user owns the `chatId` before issuing anything (CHT-05).
- Sub-agent `conversationId` and sandbox keys are namespaced by the owner's chat on the server, never a raw model-supplied id.
- Side-effecting tools take idempotency keys; `oomMachine` is the only retry path (CHT-18).
- Secret keys stay out of the browser (RT-01); side-channel `.out` writes need one.

**Pitfalls → rules:**
- Tools passed only to `streamText` drop `toModelOutput` from turn 2 → CHT-03.
- `chat.local` init in `onChatStart` crashes continuation runs; the skills doc sets skills there too, so use `onBoot` → ★CHT-04.
- `clientData` choosing tools or sub-agent identity → CHT-23.
- Sub-agent or tool output above the ~1 MiB chunk cap → CHT-17.
- Imported `streamText` in `run` drops skill tools and compaction → ★CHT-01.

**Verify:**
- Offline: `mockChatAgent` from `@trigger.dev/sdk/ai/test`, imported before the agent module, with `harness.close()` in `finally` (CHT-25).
- Live: MCP `start_agent_chat` → `send_agent_message` → `close_agent_chat`; turn 2 must see the summary, not the raw sub-agent output.
- Dev run: force an idle suspend; confirm the sandbox is disposed in `onChatSuspend` and a continuation run still has skills and the run id.

**Gates:**
- `@trigger.dev/sdk` >= 4.5.0 for `chat.agent`.
- `ai` ^5, ^6 or >=7 canary; approvals are out of scope here.
- Self-host: an object store (`OBJECT_STORE_*`) or BYO transcript storage, or continuations boot empty (CHT-20).
- The sandbox provider is external; its keys and cost are separate.

**Docs:** `ai-chat/patterns/sub-agents` · `ai-chat/patterns/skills` · `ai-chat/patterns/code-sandbox` · `ai-chat/tools` · `ai-chat/side-channels` · `ai-chat/chat-local` · `ai-chat/lifecycle-hooks` · `ai-chat/testing` · `ai-chat/mcp` · `ai-chat/reference` · `concurrency`
