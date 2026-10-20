---
name: chat-agent
description: Build, migrate or debug AI chat agents on Trigger.dev (chat.agent, the chat transport, sessions, transcript storage, tool approvals, server, Slack and Linear callers). Use when a Trigger.dev project needs a chat assistant or agent, or code imports @trigger.dev/sdk/ai or @trigger.dev/sdk/chat.
argument-hint: "[what the agent should do, or what is broken]"
allowed-tools: Bash(trigger-ctx *) Bash(node *trigger-ctx.mjs *) Bash(npx trigger.dev@latest whoami*) Bash(npx tsc --noEmit*) Bash(pnpm exec tsc --noEmit*) Bash(yarn tsc --noEmit*) Bash(bunx tsc --noEmit*)
---

# Trigger.dev: chat agents

A chat agent is a durable multi-turn assistant that survives refreshes, deploys, idle gaps and crashes. Three parts: the agent task (`chat.agent`, which owns the turn loop), a durable **session** (`.in` and `.out` streams keyed on `chatId`, outliving runs), and the frontend **transport** (`useTriggerChatTransport` feeding `useChat`). A run suspends after `idleTimeoutInSeconds` (30 s by default) and resumes the same process; continuation runs boot cold and fire `onBoot`.

## Invariants (check every snippet; the plugin's edit checks enforce several)

1. **SDK ≥ 4.5.0.** Older projects update first (`npx trigger.dev@latest update`). `needsApproval` needs AI SDK 6 or newer.
2. **`streamText` comes from `run`'s argument** (`run: async ({ messages, signal, streamText }) => …`), not from `"ai"`. The stock import silently loses compaction, steering and injection. Spreading `...chat.toStreamTextOptions()` into it is the supported alternative (and the only one in a custom agent).
3. **Both server actions check ownership.** The token action and the start-session action must verify that the signed-in user owns the `chatId` before minting anything. Never authorise from `clientData`. Without this, one user can reach another user's chat.
4. **`chat.local` is initialised in `onBoot`** (every fresh worker, continuations included), never in `onChatStart` or `onPreload`.
5. **Declare tools on `chat.agent({ tools })`**, not only at the `streamText` call, so each tool's `toModelOutput` is re-applied across turns.
6. **Persistence:** the platform snapshot by default (a self-hosted instance needs `OBJECT_STORE_*`), or `storage: TranscriptStorage` when your database is the source of truth. `hydrateMessages` is deprecated. The transcript format is roll-forward only, and `createLoadTranscriptAction` has no tenant check of its own: wrap it.
7. **Retries:** keep `maxAttempts: 1`; `oomMachine` is the only retry path; tools must be idempotent because OOM retries and regenerate replay them.
8. **Approvals and questions:** a question tool has no `execute`; an approval uses `needsApproval` plus `execute`. `onAction` returns nothing or `chat.turn()`, never a response.

## Anchor and discovery

Use the project facts in context (or `trigger-ctx detect --brief`): SDK version, `ai` major, frontend, Cloud or self-host. Infer first, ask second (at most two questions in the whole reply, next steps included, defaults for the rest; the repo usually answers):

| # | Ask only if not inferable | Changes | Infer from |
|---|---|---|---|
| C1 | Migrating an existing chat route, or new? | `migrate-route-handler` vs `greenfield` | `app/api/chat/route.ts`, `streamText` + `toUIMessageStreamResponse`, `resumable-stream`, `useChat` |
| C2 | Who talks to the agent: a browser, Slack or Linear, other servers or agents? | transport vs `AgentChat` vs channels (beta) | `@slack/*`, webhook routes, a frontend present |
| C3 | Must chat history live in your database (list, search, edit, branch, audit)? | platform snapshot vs `storage` | prisma or drizzle schema with chat tables |
| C4 | Do any tools have side effects that need approval? | `needsApproval`, idempotent tools | an existing tools map; `ai` major |
| C5 | How do users authenticate, and who owns a chat? | the ownership check (mandatory) | next-auth, clerk, lucia, supabase |
| C6 | Is first-reply latency important? | Preload vs Head Start vs neither | a warm server route, a serverless host |
| C7 | Long conversations or very large tool outputs? | compaction, prompt caching, id references (about 1 MiB cap) | the domain (RAG, code, files) |
| C8 | Cloud or self-hosted? | `baseURL`; `OBJECT_STORE_*` | the project facts |

Inferred without asking: the frontend (the React transport hook is React-only; other frameworks use the client protocol), the AI SDK major, the provider packages, the deploy host.

## Choose the layer, the callers and the persistence

- **Layer:** `chat.agent` (default) · `chat.createSession` (your own per-turn code; no lifecycle hooks, actions or approvals; Head Start works with it since 4.5.0 even though the `ai-chat/backend` capability table still says no) · `chat.customAgent` with primitives (a custom protocol) · raw `sessions` (not chat-shaped).
- **Callers:** a browser (React transport) · a server, script, Slack bot or another agent (`AgentChat`; deterministic `id` to resume) · a non-React or non-TS client (the client protocol over REST/SSE) · Slack, Linear or channels (**private beta**: check access first; the fallback is `AgentChat` called from your own handler).
- **Persistence:** snapshot (default) · `storage: TranscriptStorage` (`runTranscriptStorageTests` to verify) · never new `hydrateMessages`.

## Playbooks (read one, at `${CLAUDE_SKILL_DIR}/playbooks/<file>`)

| Situation | File |
|---|---|
| a new chat agent from scratch | `greenfield.md` |
| an existing `useChat` + route handler to move | `migrate-route-handler.md` |
| history in your database, list/search/edit | `persistence.md` |
| tool approvals, questions to the user, undo/edit actions | `approvals-and-questions.md` |
| Slack, Linear, server callers, other agents | `server-and-channel-callers.md` |
| the first reply is slow | `fast-first-reply.md` |
| long conversations, big tool outputs, caching | `long-conversations.md` |
| crashes, OOM, recovery, deploys mid-conversation | `resilience.md` |
| sub-agents, skills, code sandboxes | `sub-agents-tools-sandbox.md` |
| tests, a live smoke test, readiness to ship | `test-verify-ship.md` |

## Verify before you write, answer in the bridge format

Resolve every API name with `trigger-ctx docs <topic or name>` (a name returns whether the installed types declare it, any `@deprecated` note, and the pinned-doc `file:line`) and read the local pinned page (`node_modules/@trigger.dev/sdk/docs/ai-chat/…`) or the web `.md`; the chat API changes fast (changelog: https://trigger.dev/docs/ai-chat/changelog). If no docs tier is reachable, still answer from the playbook and list every API name you could not check as unverified; never refuse for lack of docs. Answer as: *You're building X. Y fits because Z (not W, because …). Minimal shape (≤ 15 lines). Watch out for (≤ 3). Docs: local path · URL.* Name the environment when you test (`dev` unless the user says otherwise); a live smoke test is MCP `list_agents` → `start_agent_chat` → `send_agent_message` → `close_agent_chat`, and `start_agent_chat` in prod spends real LLM budget: ask first.
