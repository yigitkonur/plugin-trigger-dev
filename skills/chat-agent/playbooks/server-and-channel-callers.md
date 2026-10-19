# Server, Slack and Linear callers (`chat-agent/server-and-channel-callers`)
**Use when:** a server route, script or agent must drive a `chat.agent`, or Slack, Linear, channels or `AgentChat` is named; symptom: each message starts a new chat, or a thread never resumes.  **Not this playbook if:** the caller is a browser (`greenfield`, `migrate-route-handler`); history must live in your DB (`persistence`); the topic is approvals (`approvals-and-questions`); the agent is a delegated tool (`sub-agents-tools-sandbox`).

**Decide:**
- Access check first for Slack, Linear or channels: hosted ingress is private beta. Ask the user, or check whether the webhook MCP tools respond. No access → fallback: your own route calls `AgentChat`.
- `AgentChat` when the caller is server code, a script or another agent (the non-beta path).
- Client protocol over REST/SSE when the caller is non-TS or non-React.
- Your own `id` (thread or ticket key) when the conversation must resume; the default random `id` starts a new chat each call.

**Order of work:**
1. Confirm `@trigger.dev/sdk` ≥ 4.5.0 and a `chat.agent` exists (`ai-chat/server-chat`).
2. Slack, Linear or channels: run the access check before designing hosted ingress (`webhooks/slack`, web only).
3. Set the conversation key as `id` on `AgentChat` (`ai-chat/server-chat`, options table).
4. Authorise `chatId` for the signed-in user before any read, `new AgentChat`, or token mint (`auth.createPublicToken`, `ai-chat/sessions`).
5. Call `sendMessage()` and read the returned `ChatStream` (`ai-chat/server-chat`).
6. Persist `lastEventId` in `onTurnComplete` and the run id in `onTriggered` ("Stateless request handlers", `ai-chat/server-chat`).
7. Own ingress only: verify the provider signature, and key the trigger on the provider event id (`idempotency`).
8. Prove it (Verify).

**Invariants:**
- Every server path that reads a session, starts a chat or mints a token checks that the signed-in user owns `chatId`. Never take ownership from the body or `clientData`.
- Tokens are scoped to `read` and `write` on `sessions: chatId`, with an `expirationTime`.
- Same conversation key, same `id`, same chat.
- Self-host: `baseURL` points at your instance; an object store or your own transcript storage is configured.
- Slack and Linear are never the default recommendation; the fallback is always stated.

**Pitfalls → rules:**
- The pinned stateless example reads `chatId` from the request body with no owner check → CHT-05, CHT-23.
- Own route triggers without the provider event id as the key; redelivery double-fires → WH-06.
- Message rows and `lastEventId` written in separate awaits → CHT-13.
- Self-host without an object store: continuations boot empty → CHT-20.
- A random default `id` per Slack message starts a new chat each time → no rule id; set `id`.
- Hosted Slack/Linear recommended before the access check → no rule id; beta gate.

**Verify:**
- Offline: `mockChatAgent` from `@trigger.dev/sdk/ai/test`, imported before the agent (CHT-25); two turns on one `id` keep history.
- Route test: a `chatId` owned by another user is refused.
- Live: MCP chat smoke test (`ai-chat/mcp`), then a dev run with two messages through the handler; the second reply shows the first turn.
- Fallback: the same provider event delivered twice starts one run.

**Gates:**
- `@trigger.dev/sdk` ≥ 4.5.0 for `chat.agent`.
- AI SDK 5, 6 or 7; approvals need 6+.
- Private beta: Slack, Linear, channels, hosted webhooks.
- Self-host: `baseURL`; object store configured (CHT-20).

**Docs:** `ai-chat/server-chat` · `ai-chat/sessions` · `ai-chat/client-protocol` · `ai-chat/testing` · `ai-chat/mcp` · `ai-chat/quick-start` · `idempotency` · `webhooks/slack` (web only) · `webhooks/linear` (web only) · `webhooks/channels` (web only) · `webhooks/session-routing` (web only)
