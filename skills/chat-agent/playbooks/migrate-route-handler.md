# Migrate a useChat route handler (`chat-agent/migrate-route-handler`)
**Use when:** `app/api/chat/route.ts` runs `streamText` + `toUIMessageStreamResponse`, the browser uses `useChat` with an `api` URL, and `resumable-stream`/Redis handles refresh.  **Not this playbook if:** there is no route yet (`greenfield`); history must live in your DB (`persistence`); the main ask is approvals, server/Slack callers or first-reply latency (`approvals-and-questions`, `server-and-channel-callers`, `fast-first-reply`).

**Decide:**
- `chat.agent` when you want managed `streamText`, hooks, actions and Head Start; `chat.createSession` when you need your own per-turn code and can do without hooks, actions and approvals.
- Keep the old route only as a Head Start handler when first-reply latency matters; otherwise delete it.
- Platform snapshot for history by default; `storage: TranscriptStorage` when history must live in your DB. Don't add new `hydrateMessages` code.

**Order of work:**
1. Inventory the route: `streamText` options, `tools`, what `onFinish` persists. Verify the `run` payload (`messages`, `signal`, `streamText`) in `ai-chat/migrating-from-a-route-handler`.
2. Move `streamText` into `chat.agent`'s `run`, taking it from the argument; drop `convertToModelMessages` and `toUIMessageStreamResponse`; return the result (or `chat.pipe`); declare `tools` on the config too. Verify `chat.agent` in the same doc.
3. Replace the route with two server actions: start via `chat.createStartSessionAction`, mint via `auth.createPublicToken` scoped to `chatId`. Both check ownership. Verify in `ai-chat/quick-start`.
4. Keep `useChat`; swap the `api` URL for `useTriggerChatTransport` with `accessToken` and `startSession`; `import type` the agent. Verify in `ai-chat/frontend`.
5. Per-turn writes go in `onTurnComplete` (it also fires on errors); one-time setup goes in `onChatStart`. Verify in `ai-chat/lifecycle-hooks`.
6. Delete the route, the `resumable-stream` package, the Redis client, the stream-resume `GET` route and the `activeStreamId` column. Keep `lastEventId`. Verify the list in the migration doc.
7. After a resume, call `transport.stopGeneration(chatId)` instead of `useChat`'s `stop()`. Verify in the migration doc.
8. Run the Verify checks below.

**Invariants:**
- Both actions check that the signed-in user owns `chatId`: claim it on first sight, assert ownership on every mint.
- Create the chat record on your server before rendering `Chat`.
- `TRIGGER_SECRET_KEY` stays in server actions; the browser gets only the session-scoped token.
- Wire `abortSignal` to `signal`; never clear `lastEventId` when a run ends.

**Pitfalls → rules:**
- `streamText` imported from `"ai"` inside `run` silently drops compaction and steering → CHT-01.
- Tools declared only at the call site break `toModelOutput` after turn 1 → CHT-03.
- `streamText` without `abortSignal` means Stop never reaches the model → CHT-02.
- Token or start action with no ownership check → CHT-05.
- Prerelease `chat.createAccessToken`, `getStartToken` or `triggerConfig` left in the transport → CHT-06.
- Leftover route, `resumable-stream` or `convertToModelMessages` in `run` → CHT-24.

**Verify:** `mockChatAgent` (`@trigger.dev/sdk/ai/test`, imported before the agent module) runs a turn offline. Then the MCP chat smoke test (`ai-chat/mcp`), then `trigger dev` (the project's CLI) and check: refresh mid-stream keeps streaming, Stop halts server-side, a follow-up after idle keeps history.

**Gates:** `@trigger.dev/sdk` ≥ 4.5.0 (`ai-chat/reference`). AI SDK 5, 6 or 7; on 7 add `@ai-sdk/otel` (CHT-21). Self-host: platform snapshots need object-store config (CHT-20), or bring your own `storage`.

**Docs:** `ai-chat/migrating-from-a-route-handler` · `ai-chat/upgrade-guide` · `ai-chat/quick-start` · `ai-chat/frontend` · `ai-chat/lifecycle-hooks` · `ai-chat/testing` · `ai-chat/mcp` · `ai-chat/reference`
