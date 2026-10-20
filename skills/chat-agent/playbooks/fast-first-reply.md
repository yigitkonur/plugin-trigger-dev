# Fast first reply (`chat-agent/fast-first-reply`)
**Use when:** first-reply latency is the complaint (slow first text, boot before the LLM call) on a `chat.agent` chat.  **Not this playbook if:** still on a route handler → `migrate-route-handler`; crashes or OOM → `resilience`; slow as history grows → `long-conversations`; Slack, script or agent caller → `server-and-channel-callers`.

**Decide:**
- Preload when the surface is browser-only or no warm server exists; it starts the run before the first message, so idle compute is paid if the user never sends.
- Head Start when a warm server (Next.js, Hono, SvelteKit, Workers) serves the chat; it runs step 1 in your process and triggers no speculative run.
- Never both: Head Start already waits for a real first message, so Preload only adds idle cost.
- Head Start covers step 1 of turn 1 only; steps 2+ and tool execution still run in the agent.
- Neither when first-reply latency is not a complaint.

**Order of work:**
1. Pick one approach and drop the other from the plan.
2. Preload: call `transport.preload(chatId)` on mount; init in `onPreload`; skip repeat work in `onChatStart` when `preloaded` is true.
3. Head Start: put tool schemas in a module that imports only `ai` and `zod`; executes live elsewhere, and only the route imports schemas.
4. Route: mount `chat.headStart({ agentId, run })` as `POST`; in `run`, use the SDK's `streamText` (it pins `stopWhen: stepCountIs(1)`), pass schema-only `tools`, and use the same model as `chat.agent`.
5. Set `triggerConfig` on `chat.headStart`, and `export const maxDuration` on serverless routes.
6. Client: add `headStart: "/api/chat"` to `useTriggerChatTransport`; keep `accessToken` (and `startSession` if used) for later turns.

**Invariants:**
- Every token or start action checks that the signed-in user owns `chatId`; the Head Start route needs the same check, since its first turn creates the session.
- `clientData` is never authorisation; take `userId` from the server session (the docs' Preload example passes it in `clientData`; do not copy that).
- Provider keys stay on the server; never re-set `messages`, `stopWhen` or `abortSignal` on the SDK's `streamText`.
- Persist in `onTurnComplete`, under the one assistant `messageId` shared by step 1 and steps 2+.

**Pitfalls → rules:**
- Heavy `execute` imports, a body parser, or no `maxDuration` in the Head Start route → CHT-15.
- Browser-supplied `clientData.userId` used to load the user → CHT-23.
- Token or start action without an ownership check → CHT-05.
- Trigger options on the transport (`triggerConfig`, `transport.preload(id, opts)`) → CHT-06; set them on `chat.headStart` or `chat.createStartSessionAction`.
- Preload and Head Start enabled together → no catalog id; the docs say "pick one, not both".
- Head Start first turn runs a `hydrateMessages` hook with a bare `UPDATE` → no catalog id; `onPreload` did not run, so upsert the row.

**Verify:**
- Offline: `mockChatAgent` from `@trigger.dev/sdk/ai/test`, imported first (CHT-25); assert first-turn chunks and the `onChatStart` branch.
- POST a first-turn payload to the Head Start route; step-1 SSE text should arrive before the handover.
- Dev run on a cold chat: time-to-first-text with and without the approach.
- MCP chat smoke test (`ai-chat/mcp`) on a dev run; a non-owner token request must fail.

**Gates:**
- `@trigger.dev/sdk` >= 4.5.0 for `chat.agent`.
- AI SDK 5/6/7; approvals need AI SDK 6+ (CHT-16).
- Serverless timeout covers step 1, agent boot and tool calls.
- Self-host: the route runs on your server; continuations need a configured object store or `storage` (CHT-20).

**Docs:** https://trigger.dev/docs/ai-chat/fast-starts · https://trigger.dev/docs/ai-chat/lifecycle-hooks · https://trigger.dev/docs/ai-chat/frontend · https://trigger.dev/docs/ai-chat/backend · https://trigger.dev/docs/ai-chat/quick-start · https://trigger.dev/docs/ai-chat/testing · https://trigger.dev/docs/ai-chat/mcp · https://trigger.dev/docs/ai-chat/reference
