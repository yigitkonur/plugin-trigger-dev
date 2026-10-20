# Long conversations and big tool outputs (`chat-agent/long-conversations`)
**Use when:** context fills up or per-turn tokens climb; a tool returns files, rows or documents; a run fails with `ChatChunkTooLargeError`; `cacheReadTokens` stays 0 on an unchanged prefix.  **Not this playbook if:** slow first reply → `fast-first-reply`; OOM or crash loops → `resilience`; history must live in your DB → `persistence`.
**Decide:**
- `compaction` option (summary replaces model messages) when token totals cross your threshold; `compactUIMessages` only if the UI should also drop old messages.
- Native compaction (`patterns/native-compaction`) when one provider is fixed and you want its context editing; it is per-provider, so keep the Trigger summary as the fallback baseline.
- `toModelOutput` when the model needs a digest but the UI keeps full output; id reference when one record could exceed ~1 MiB (1048576 bytes minus envelope).
- `chat.compact()` or `chat.compactionStep()` only inside your own `prepareStep`; otherwise let the option run.
**Order of work:**
1. Measure per-turn growth from `previousTurnUsage` and `totalUsage` before tuning.
2. Set `compaction` on `chat.agent()` with `shouldCompact` and `summarize`; log through `onCompacted`.
3. Use the run argument's `streamText`; if you spread `chat.toStreamTextOptions()` into your own call, add no `prepareStep` after it.
4. Keep the cached prefix byte-stable: static text in `chat.prompt.set`, breakpoints via `cacheControl` and `prepareMessages`, dynamic context via `chat.inject`.
5. Near the cap, store the value in your DB and emit only an id; `transient` parts still count against the cap.
6. Write message history with `chat.deferBeforeOutput()`; `await` only if this turn reads it back.
7. Prove it (Verify below).
**Invariants:**
- Token and `createStartSessionAction` handlers check that the signed-in user owns `chatId` before returning anything (CHT-05).
- Wrap every `createLoadTranscriptAction` export in an owner check (CHT-12).
- Stored tool outputs and fetch routes are scoped by owner and `chatId`; `clientData` is never an authorisation input (CHT-23).
**Pitfalls → rules:**
- Imported `streamText` from `ai` silently drops compaction and injection (CHT-01).
- A `prepareStep` after the spread replaces the injected one (CHT-10).
- Timestamps or request IDs in the system prompt break the prefix cache (CHT-22); so does swapping the model or tool set mid-chat.
- Tools with `toModelOutput` passed only at the call site (CHT-03).
- A message write via `chat.defer` can lose the user's message on refresh (CHT-09); prefer `deferBeforeOutput` to a blocking `await`.
- An id emitted before its row is written gives 404s on the follow-up fetch.
**Verify:**
- `mockChatAgent` from `@trigger.dev/sdk/ai/test`: a seeded long history should fire `onCompacted`; a >1 MiB fake tool output should yield an id-only chunk. Import the harness before the agent and `await harness.close()` in `finally` (CHT-25).
- MCP chat smoke test (`ai-chat/mcp`), then a dev run of 3+ turns: `cacheReadTokens` > 0 from turn 2 on an unchanged prefix.
**Gates:**
- `@trigger.dev/sdk` >= 4.5.0.
- System-block cache breakpoints need AI SDK v6+; on v5 cache through `prepareMessages` only.
- Native compaction is provider-specific (Anthropic context editing, OpenAI stored responses).
- Self-host: `OBJECT_STORE_*` or your own `storage`; otherwise continuations boot empty (CHT-20).
**Docs:** https://trigger.dev/docs/ai-chat/compaction · https://trigger.dev/docs/ai-chat/prompt-caching · https://trigger.dev/docs/ai-chat/patterns/large-payloads · https://trigger.dev/docs/ai-chat/patterns/native-compaction · https://trigger.dev/docs/ai-chat/pending-messages · https://trigger.dev/docs/ai-chat/background-injection · https://trigger.dev/docs/ai-chat/testing · https://trigger.dev/docs/ai-chat/mcp · https://trigger.dev/docs/ai-chat/transcript-storage
