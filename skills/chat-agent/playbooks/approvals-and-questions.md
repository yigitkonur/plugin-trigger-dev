# Approvals and questions (human-in-the-loop) (`chat-agent/approvals-and-questions`)

**Use when:** the agent needs a human choice, a missing value or a yes/no before acting. Symptoms: a question tool runs by itself, or a denied action still executes.  **Not this playbook if:** the caller is a server, Slack or channel (`chat-agent/server-and-channel-callers`), the fault is storage (`chat-agent/persistence`), or it is a crash during a pause (`chat-agent/resilience`).

**Decide:**
- Question (no `execute`) when only the human can supply the value; the answer returns via `addToolOutput`.
- Approval (`needsApproval: true` plus `execute`) when inputs are known and the action has side effects; denial skips `execute`.
- Choose-then-act when options come from tool results: a selection question, then an action tool that re-checks the choice. Also the AI SDK 5 route.
- `onAction` is for state edits (undo, edit, regenerate), never approvals.
- `idleTimeoutInSeconds` (30 s default) for quick answers; `0` for answers that take minutes, since only the idle window counts toward compute.
- `turnTimeout` (default `"1h"`) ends a waiting run; a later answer continues from transcript storage.

**Order of work:**
1. Classify each touchpoint (question, approval, UI action, none) and its side effects. Verify in `ai-chat/patterns/human-in-the-loop`.
2. Define question tools without `execute`; approval tools with `needsApproval: true` plus `execute`. Verify `needsApproval`.
3. Declare tools on the agent config; the `streamText` in `run` receives them. Verify `streamText({ tools })` in `ai-chat/tools`.
4. Owner check in the start-session and token actions. Verify `startSession` and `accessToken` in `ai-chat/quick-start`.
5. Frontend: render on `input-available`, answer with `addToolOutput`, let `sendAutomaticallyWhen` start the turn, approve or deny with `addToolApprovalResponse`. Verify `lastAssistantMessageIsCompleteWithToolCalls`.
6. Validate answers server-side; set `idleTimeoutInSeconds` and `turnTimeout`. Verify "Duration and cost while paused".
7. Prove it (see Verify).

**Invariants:**
- Start-session and token actions, refresh included, check that the signed-in user owns the `chatId`.
- An approved `execute` runs only after a recorded approve response.
- Approvable side-effecting tools are idempotent; OOM retries re-run them.
- Answers are validated against the pending call before use.
- Self-host: `OBJECT_STORE_*` or your own `storage`, or continuations boot empty.

**Pitfalls → rules:**
- Question tool with `execute`, `needsApproval` on AI SDK 5, or `addToolOutput` without `sendAutomaticallyWhen` → CHT-16.
- Owner check missing from a start-session or token action → CHT-05.
- Authorisation taken from `clientData` → CHT-23.
- `onAction` returning anything but nothing or `chat.turn()` → CHT-11.
- Approved tool without idempotency → CHT-18.
- Self-host without `OBJECT_STORE_*` or `storage` → CHT-20.

**Verify:**
- `mockChatAgent` (import `@trigger.dev/sdk/ai/test` first): assert chunks and hook order for a question stop and an approval.
- Dev run in a browser: answer a question; deny an approval and confirm nothing ran; approve a fresh one.
- MCP smoke test (`start_agent_chat`, `send_agent_message`, `close_agent_chat`) covers only the plain path; its doc has no answer call.

**Gates:**
- `@trigger.dev/sdk` >= 4.5.0 for `chat.agent`.
- AI SDK 6 or newer for `needsApproval`.
- Self-host: `OBJECT_STORE_*` or your own `storage` for suspended pauses.
- Slack/channel routing is Beta; never the default here.

**Docs:** https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop · https://trigger.dev/docs/ai-chat/actions · https://trigger.dev/docs/ai-chat/tools · https://trigger.dev/docs/ai-chat/quick-start · https://trigger.dev/docs/ai-chat/testing · https://trigger.dev/docs/ai-chat/mcp
