# Persisting chat history (`chat-agent/persistence`)
**Use when:** history must survive refreshes and deploys and be queryable in your own database; reloads duplicate the last turn; or a chat still persists via `hydrateMessages`.  **Not this playbook if:** no chat exists yet (`greenfield`); the route handler still streams (`migrate-route-handler`); the symptom is crashes or OOM (`resilience`).

**Decide:**
- `storage: TranscriptStorage` when your database is the source of truth; platform snapshot when history only has to survive runs.
- `loadContext` on the storage only when your database must decide the model's context (branching, rollback).
- Self-host snapshot only with `OBJECT_STORE_*` set; otherwise bring storage.
- `onTurnComplete` only for live session state (the access token) the transcript does not cover; the resume cursors reach `save` as `changeset.cursors`, so a `lastEventId` write there is redundant with `storage`.
- `hydrateMessages` never in new code: deprecated; it switches off runtime transcript reads and writes.

**Order of work:**
1. Map chat tables to `TranscriptStorage` (from `@trigger.dev/sdk/ai`); verify `save`, `load`, `loadContext`.
2. Implement `save` and `load`: `save` writes the changes (or the document), `state` and `changeset.cursors` in one transaction; `load` returns them.
3. Set `storage` on `chat.agent` and delete `hydrateMessages` in the same change.
4. Export the read only as `chat.createLoadTranscriptAction(storage, …)` behind your ownership check.
5. Apply the same owner check to `chat.createStartSessionAction` and its token refresh.
6. Run `runTranscriptStorageTests` against the real database, plus `mockChatAgent` turns.
7. Dev run (`trigger dev`): two turns, refresh mid-stream, rows match the UI; idle past `idleTimeoutInSeconds`, then send again.
8. Delete the recovery and cursor code the runtime now owns.

**Invariants:**
- Start, token and read actions check the signed-in user owns the `chatId` before returning; `createLoadTranscriptAction` has no tenant check.
- Authorise from server-derived identity, never from browser `clientData` (CHT-23).
- `save` is awaited, not fire-and-forget; in-flight writes do not reliably finish if the run suspends right after.
- The saved format is roll-forward only: an older deployment cannot read newer transcripts and loses that history.
- `chat.agent` requires `@trigger.dev/sdk` ≥ 4.5.0.

**Pitfalls → rules:**
- `storage` set together with `hydrateMessages`: startup error (CHT-08).
- Unwrapped `chat.createLoadTranscriptAction(`: any signed-in user can read any chat (CHT-12).
- Start or token action without an owner check: exposes other users' session tokens (CHT-05).
- Hook-based persistence (no `storage`): message write and `lastEventId` in separate awaits, so a refresh between them duplicates the turn; with `storage`, cursors written outside `save`'s transaction do the same (CHT-13).
- Self-host with neither `OBJECT_STORE_*` nor `storage`: continuations boot empty (CHT-20).
- Rolling back after the new format is saved: earlier history is lost (no CHT rule).

**Verify:**
- `runTranscriptStorageTests` against your real database (`TEST_DATABASE_URL`).
- `mockChatAgent` from `@trigger.dev/sdk/ai/test`, imported before the agent module and closed (CHT-25).
- MCP chat smoke test (`ai-chat/mcp`) plus the dev run in step 7.
- A cross-user request to the read action is rejected.

**Gates:**
- `@trigger.dev/sdk` ≥ 4.5.0 (`chat.agent`).
- Self-host: `OBJECT_STORE_*` for the default snapshot (`OBJECT_STORE_DEFAULT_PROTOCOL` selects the driver).
- Channels (Slack, Linear) keep history in the same session store; nothing extra to configure here.

**Docs:** https://trigger.dev/docs/ai-chat/transcript-storage · https://trigger.dev/docs/ai-chat/patterns/database-persistence · https://trigger.dev/docs/ai-chat/patterns/persistence-and-replay · https://trigger.dev/docs/ai-chat/migrating-from-hydrate-messages · https://trigger.dev/docs/ai-chat/lifecycle-hooks · https://trigger.dev/docs/ai-chat/sessions · https://trigger.dev/docs/ai-chat/testing · https://trigger.dev/docs/ai-chat/reference · https://trigger.dev/docs/ai-chat/quick-start · https://trigger.dev/docs/ai-chat/mcp
