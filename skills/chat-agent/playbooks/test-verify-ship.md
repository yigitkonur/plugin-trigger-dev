# Test, verify and ship a chat agent (`chat-agent/test-verify-ship`)
**Use when:** a `chat.agent` is about to ship, or its turns, tools, storage or auth changed; a live chat fails where a dev run cannot show it.  **Not this playbook if:** still building (`chat-agent/greenfield`), migrating a route (`chat-agent/migrate-route-handler`), or designing storage (`chat-agent/persistence`).

**Decide:**
- Offline `mockChatAgent` for every change; MCP smoke test only after it passes.
- Platform snapshot (default) unless your database must own history, then `storage: TranscriptStorage`. Self-host snapshots need `OBJECT_STORE_*`.
- Pinned sessions (stored `externalDeploymentId`) hand over at the next turn boundary; `versionSkew: "hold"` opts one agent out; `lockToVersion` is never cleared by `requestUpgrade`.
- CI deploy with `--external-id <commit>` when sessions may be pinned (skew protection needs v4.5.12+).

**Order of work:**
1. Gate the stack: `@trigger.dev/sdk` ≥ 4.5.0 and the `ai` major; verify `chat.agent` in `ai-chat/reference`.
2. Lock access: verify `createStartSessionAction` and `chat.createLoadTranscriptAction` (`ai-chat/quick-start`, `ai-chat/transcript-storage`); add an ownership check to each.
3. Settle storage: verify `TranscriptStorage`; for custom storage, `runTranscriptStorageTests` (`ai-chat/migrating-from-hydrate-messages`).
4. Test offline: verify `mockChatAgent`, `harness.sendMessage`, `harness.sendAction`, `harness.sendStop`, `harness.close`.
5. Dev run: verify `useTriggerChatTransport` and `startSession` (`ai-chat/frontend`); check the run in the dashboard.
6. MCP smoke test: verify the agent-chat tools (`mcp-tools`, `ai-chat/mcp`).
7. Pin and deploy: verify `chat.requestUpgrade`, `versionSkew`, `lockToVersion` (`ai-chat/patterns/version-upgrades`) and `--external-id` (`github-actions`).
8. Post-deploy: repeat the smoke test on the deployed version (prod only with approval).

**Invariants:**
- Token/start-session and transcript-load actions check that the signed-in user owns `chatId` before returning (CHT-05, CHT-12). `createLoadTranscriptAction` does no tenant check itself. `clientData` is input, never authorisation (CHT-23).
- If you pass `storage`, drop `hydrateMessages` (deprecated); never both (CHT-08).
- Self-host needs an object store or `storage` (CHT-20).
- Smoke tests target a dev worker; prod only with the user's explicit approval.

**Pitfalls → rules:**
- `streamText` imported from `"ai"` inside `run` loses managed compaction, steering and telemetry (CHT-01).
- Side-effecting tools without idempotency, though OOM retry and regenerate re-run them (CHT-18). Default is `maxAttempts: 1`; `oomMachine` adds one OOM-only attempt.
- Harness imported after the agent, or never closed (CHT-25).
- Statements after `await chat.endAndContinue()` (CHT-19); `lockToVersion` with `requestUpgrade` (CHT-19).

**Verify:**
- Offline: import `@trigger.dev/sdk/ai/test` before the agent module; close the harness in `finally` (CHT-25). Only the model and runtime are faked.
- Assert on `harness.allChunks` after `sendMessage`, `sendAction`, `sendStop` and `sendRegenerate`.
- MCP smoke test: `list_agents` → `start_agent_chat` (`agentId`) → `send_agent_message` (`chatId`, `message`) → `close_agent_chat`. The pinned MCP reference documents no `environment` parameter, so confirm the server's target environment first.
- Dev run: `trigger dev` with the frontend; if session start fails, check ownership and `TRIGGER_SECRET_KEY` (quick-start).

**Gates:**
- `@trigger.dev/sdk` ≥ 4.5.0 for `chat.agent`.
- `ai` ^5, ^6 or ≥7 canary; `ai@7` needs `@ai-sdk/otel` only if you want model-call spans (CHT-21).
- Self-host: `OBJECT_STORE_*` for snapshots; set `TRIGGER_API_URL` to your instance (`manual-setup`).

**Docs:** https://trigger.dev/docs/ai-chat/testing · https://trigger.dev/docs/mcp-tools · https://trigger.dev/docs/ai-chat/mcp · https://trigger.dev/docs/ai-chat/quick-start · https://trigger.dev/docs/ai-chat/transcript-storage · https://trigger.dev/docs/ai-chat/migrating-from-hydrate-messages · https://trigger.dev/docs/ai-chat/patterns/version-upgrades · https://trigger.dev/docs/ai-chat/error-handling · https://trigger.dev/docs/ai-chat/reference · https://trigger.dev/docs/ai-chat/frontend · https://trigger.dev/docs/deployment/atomic-deployment · https://trigger.dev/docs/github-actions · https://trigger.dev/docs/manual-setup
