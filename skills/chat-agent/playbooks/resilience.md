# Resilience: crashes, OOM, recovery and deploys (`chat-agent/resilience`)
**Use when:** a turn hits out-of-memory, a worker dies mid-stream, raw provider errors reach the UI, or a deploy moves open chats.  **Not this playbook if:** the question is history storage (`chat-agent/persistence`), cost (`chat-agent/long-conversations`) or approvals (`chat-agent/approvals-and-questions`).

**Decide:**
- `oomMachine` when a turn can spike memory: it is the only retry path (`maxAttempts` becomes 2 internally) and reruns the failed turn once on the larger machine.
- No retry for other errors. Use AI SDK provider retries for transient model failures; after a failed turn, the user resends or you call `regenerate()`.
- Default recovery when a kept partial reply is acceptable; `onRecoveryBoot` when you need a banner, a drop-partial policy or a blocking `beforeBoot` write (its errors fail the run).
- Pinned sessions follow their pin by default. `versionSkew: "hold"` when a long tool chain must not move; `chat.requestUpgrade({ externalDeploymentId })` to move to a named build; `lockToVersion` only for a hard freeze, since upgrades cannot escape it.

**Order of work:**
1. Confirm the gate, then check that both token actions (`createStartSessionAction` and the token action) verify the user owns `chatId`; see `chat.agent` in `ai-chat/reference`.
2. Set `oomMachine` and read `retry.outOfMemory` in `ai-chat/patterns/oom-resilience`.
3. Make side-effecting tools idempotent with stable keys.
4. Sanitise errors via `uiMessageStreamOptions.onError`; move per-worker init into `onBoot`.
5. Persist failed turns in `onTurnComplete` (`error`, `stopped`).
6. Write the recovery policy in `onRecoveryBoot` (`recoveredTurns`, `beforeBoot`).
7. Set the deploy policy with `versionSkew` and `chat.requestUpgrade`; confirm pins in `deployment/atomic-deployment`.
8. Verify as below.

**Invariants:**
- Every token and start-session action checks the signed-in user owns `chatId`, again on token refresh. `clientData` is never an authorisation input.
- The transcript load action (`createLoadTranscriptAction`) gets the same check.
- Tools rerun whole after an OOM, so side effects must be safe to repeat.
- Users see sanitised errors; raw provider errors stay in logs.

**Pitfalls → rules:**
- Expecting ordinary errors to retry: there is no generic retry, and `chat.agent` runs `maxAttempts: 1` unless `oomMachine` adds an attempt.
- Tools without provider idempotency keys → CHT-18; keys from `randomUUID` or `Date.now` → TSK-11.
- `requestUpgrade` on a `lockToVersion` session, or code after `await chat.endAndContinue()` → CHT-19.
- Token or start-session action without an ownership check → CHT-05.
- Unsanitised `uiMessageStreamOptions.onError` → CHT-14.

**Verify:**
- Offline: `mockChatAgent` from `@trigger.dev/sdk/ai/test`, imported first and closed in `finally` (CHT-25). Assert sanitised error chunks and that `onTurnComplete` receives `error`.
- OOM (dev run): a memory-heavy turn with `oomMachine` set answers on attempt 2, and the side-effecting tool ran once.
- Live: MCP chat smoke test (`ai-chat/mcp`) under `trigger dev`. Stop a reply mid-stream and confirm recovery. Redeploy and confirm the pinned session stays on its version until `requestUpgrade`.

**Gates:**
- `@trigger.dev/sdk` ≥ 4.5.0 for `chat.agent`; version-skew protection needs ≥ 4.5.12.
- Self-host: `OBJECT_STORE_*` or `storage: TranscriptStorage`, else continuations boot empty (CHT-20). Pass `baseURL` (`ai-chat/reference`); never hard-code the cloud URL.

**Docs:** https://trigger.dev/docs/ai-chat/error-handling · https://trigger.dev/docs/ai-chat/patterns/oom-resilience · https://trigger.dev/docs/ai-chat/patterns/recovery-boot · https://trigger.dev/docs/ai-chat/patterns/version-upgrades · https://trigger.dev/docs/ai-chat/lifecycle-hooks · https://trigger.dev/docs/ai-chat/quick-start · https://trigger.dev/docs/ai-chat/testing · https://trigger.dev/docs/ai-chat/mcp · https://trigger.dev/docs/ai-chat/reference · https://trigger.dev/docs/deployment/atomic-deployment
