# Server, Slack and Linear callers (`chat-agent/server-and-channel-callers`)
**Use when:** a server route, script or agent must drive a `chat.agent`, or Slack, Linear, channels or `AgentChat` is named; symptom: each message starts a new chat, or a thread never resumes.  **Not this playbook if:** the caller is a browser (`greenfield`, `migrate-route-handler`); history must live in your DB (`persistence`); the topic is approvals (`approvals-and-questions`); the agent is a delegated tool (`sub-agents-tools-sandbox`).

**Decide:**
- Slack or Linear as the surface: `slack()` / `linear()` from `@trigger.dev/slack` / `@trigger.dev/linear` in the agent's `channels` list (SDK ≥ 4.8.0, generally available). The connector handles signature checks, Slack's `url_verification`, retry dedup, per-thread state, status and streaming. Below 4.8.0: offer the upgrade; otherwise your own route calls `AgentChat`.
- Any other provider event that should land in one durable session per key (customer, issue): `chat.event({ endpoint, key })` listed in the agent's `events` (`webhooks/session-routing`).
- `AgentChat` when the caller is server code, a script or another agent.
- Client protocol over REST/SSE when the caller is non-TS or non-React.
- Your own `id` (thread or ticket key) when the conversation must resume; the default random `id` starts a new chat each call.

**Order of work:**
1. Confirm `@trigger.dev/sdk` ≥ 4.5.0 and a `chat.agent` exists (`ai-chat/server-chat`).
2. Slack, Linear or channels: check the SDK is ≥ 4.8.0 and install the connector package; declare the endpoint with `webhookSource()` from it, then pass it to the channel (`webhooks/slack`, `webhooks/linear`). Set the bot token and the endpoint's signing secret before the first message.
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
- The Slack bot token and Linear credentials come from env vars, never from code or chat; the endpoint shows "Needs secret" until its signing secret is set, and deliveries are rejected meanwhile.

**Pitfalls → rules:**
- The pinned stateless example reads `chatId` from the request body with no owner check → CHT-05, CHT-23.
- Own route triggers without the provider event id as the key; redelivery double-fires → WH-06.
- Message rows and `lastEventId` written in separate awaits → CHT-13.
- Self-host without an object store: continuations boot empty → CHT-20.
- A random default `id` per Slack message starts a new chat each time → no rule id; set `id`.
- Hosted Slack/Linear recommended on an SDK older than 4.8.0 → no rule id; offer the update first.

**Verify:**
- Offline: `mockChatAgent` from `@trigger.dev/sdk/ai/test`, imported before the agent (CHT-25); two turns on one `id` keep history.
- Route test: a `chatId` owned by another user is refused.
- Live: MCP chat smoke test (`ai-chat/mcp`), then a dev run with two messages through the handler; the second reply shows the first turn.
- Fallback: the same provider event delivered twice starts one run.

**Gates:**
- `@trigger.dev/sdk` ≥ 4.5.0 for `chat.agent`.
- AI SDK 5, 6 or 7; approvals need 6+.
- `@trigger.dev/sdk` ≥ 4.8.0 for hosted webhooks, channels, `chat.event`; the connector packages (`@trigger.dev/slack`, `@trigger.dev/linear`) at the same version as the SDK.
- Self-host: `baseURL`; object store configured (CHT-20).

**Docs:** https://trigger.dev/docs/ai-chat/server-chat · https://trigger.dev/docs/ai-chat/sessions · https://trigger.dev/docs/ai-chat/client-protocol · https://trigger.dev/docs/ai-chat/testing · https://trigger.dev/docs/ai-chat/mcp · https://trigger.dev/docs/ai-chat/quick-start · https://trigger.dev/docs/idempotency · https://trigger.dev/docs/webhooks/slack · https://trigger.dev/docs/webhooks/linear · https://trigger.dev/docs/webhooks/channels · https://trigger.dev/docs/webhooks/session-routing
