# Greenfield chat agent (`chat-agent/greenfield`)
**Use when:** a new AI chat feature with no existing chat route; replies must survive refreshes, deploys and crashes.  **Not this playbook if:** a `streamText` route exists → `chat-agent/migrate-route-handler`; your DB must own history → `chat-agent/persistence`; Slack, Linear or server callers → `chat-agent/server-and-channel-callers`.

**Decide:** (discovery C1–C8; infer before asking)
- Layer: `chat.agent` by default · `chat.createSession` only with no hooks, actions, approvals or Head Start · `chat.customAgent` for a custom protocol.
- C1 new vs migrate: greenfield only when no chat route exists.
- C2 callers: browser transport for React · `AgentChat` for server, script or agent callers · client protocol for non-React or non-TS · Slack/Linear/channels are Beta: never default, always with a fallback.
- C3 history: platform snapshot by default · `storage: TranscriptStorage` when your DB must own it; wrap `chat.createLoadTranscriptAction` with the ownership check (CHT-12).
- C4 side effects: `needsApproval` + `execute` for approvals (AI SDK ≥ 6) · no `execute` for questions · idempotent tools always.
- C5 auth: your session check; ownership checks are mandatory in both token actions.
- C6 latency: Preload or Head Start, not both; Head Start serves step 1 of turn 1 only.
- C7 long or large: compaction, prompt caching, ID references above ~1 MiB.
- C8 host: cloud by default; self-host sets `baseURL` or `TRIGGER_API_URL` and needs `OBJECT_STORE_*` for snapshots.

**Order of work:**
1. Confirm `@trigger.dev/sdk` ≥ 4.5.0 and the AI SDK major; update first if older. API: `chat` from `@trigger.dev/sdk/ai`.
2. Define `chat.agent` with tools on its config and the managed `streamText` from the run argument. API: `chat.toStreamTextOptions`, `uiMessageStreamOptions`.
3. Process state in `onBoot`, per-chat setup in `onChatStart`, per-turn persistence in `onTurnComplete` (it fires on errors too). API: `chat.local`.
4. Server: `chat.createStartSessionAction` and a token action from `auth.createPublicToken` scoped to `sessions: chatId`; each checks ownership first.
5. Frontend: `useTriggerChatTransport` with `accessToken` and `startSession` (forwarding `clientData`) into `useChat({ id: chatId })` from `@ai-sdk/react`.
6. Resilience: keep `maxAttempts: 1`, add `oomMachine` for OOM retries, make side-effecting tools idempotent.
7. Run Verify, then `trigger dev` (the project's CLI) and send a message.

**Invariants:**
- Ownership check (authenticate, load chat by id and owner, throw) in both actions, including refresh; create the chat record before rendering.
- `clientData` never authorises anything.
- `streamText` comes only from the run argument.

**Pitfalls → rules:**
- Imported `streamText` silently drops compaction, steering and telemetry → CHT-01.
- Token or start action without an ownership check lets one user reach another user's chat → CHT-05.
- Old prerelease names `chat.createAccessToken` and `triggerConfig` → CHT-06.
- `chat.local` initialised in `onChatStart` or `onPreload` → CHT-04.
- `hydrateMessages` as the persistence path; `storage` is the successor → CHT-08.
- Side-effecting tools without idempotency repeat on OOM retry or regenerate → CHT-18; OOM retries need `oomMachine` → TSK-29.

**Verify:**
- Offline: `mockChatAgent` from `@trigger.dev/sdk/ai/test`; close the harness in `finally` (CHT-25).
- Live: `trigger dev`, send a message, watch the stream, wait past the 30 s idle timeout, send a second turn.
- Negative: both actions called with another user's `chatId` must refuse.
- MCP chat smoke test per `ai-chat/mcp`.

**Gates:**
- `chat.agent` needs `@trigger.dev/sdk` ≥ 4.5.0 (GA July 2026).
- Approvals need AI SDK ≥ 6; `ai@7` also needs `@ai-sdk/otel` (CHT-21).
- Self-host needs `OBJECT_STORE_*` for snapshots (CHT-20).

**Docs:** `ai-chat/overview` · `ai-chat/quick-start` · `ai-chat/backend` · `ai-chat/frontend` · `ai-chat/lifecycle-hooks` · `ai-chat/server-chat` · `ai-chat/client-protocol` · `ai-chat/transcript-storage` · `ai-chat/upgrade-guide` · `ai-chat/testing` · `ai-chat/mcp` · `ai-chat/patterns/oom-resilience`
