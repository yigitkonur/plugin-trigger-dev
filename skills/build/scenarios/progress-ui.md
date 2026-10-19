# Progress and results UI (`progress-ui`)
**You're building:** a progress bar, status badges, live LLM text, or a Run button in the browser.
**Not this card if:** the UI is a chat agent (use the `chat-agent` skill) or only server code needs the final result (use `background-job`).

**Primitives:**
- `metadata.set` / `metadata.increment` / `metadata.append` (task side) — because metadata holds state, and subscribers get each update without polling.
- `useRealtimeRun` + `accessToken` (client) — because it re-renders on every metadata update.
- `handle.publicAccessToken` from `tasks.trigger` — because it is auto-scoped to that run for 1 h, so status needs no hand-built scopes.
- `streams.define` + `.pipe()` + `useRealtimeStream` — because token or log streams exceed metadata's 256 KB cap.
- `useTaskTrigger` / `useRealtimeTaskTrigger` + `auth.createTriggerPublicToken` — because a browser Run button needs a trigger token, not a read token (RT-03).
- Rejected: `useRun` with `refreshInterval` — because it polls; `useRealtimeRun` pushes.
- Rejected: `runs.subscribeToRun` in browser code — because it is the backend API; browsers use hooks with a public token.

**Gates:** Streams need SDK ≥ 4.1.0 (`@trigger.dev/sdk`, `@trigger.dev/react-hooks`); there they are v2 by default with 28-day TTL and 300 MiB (was 1 day, 10 MB). Public access tokens default to 15 min, max 30 days. Realtime connection limits depend on plan. Self-host: hooks take `baseURL` from env, never a literal `https://api.trigger.dev` (RT-11). Nothing here is beta or cloud-only.

**Ask only if unknown:**
- Does the UI need status (progress, badge) or streamed text? Status: metadata + `useRealtimeRun`. Text: `streams.define` + `useRealtimeStream`.
- Which `@trigger.dev/sdk` version is installed? Below 4.1.0 streams are unavailable, so use metadata only or upgrade first.

**Minimal shape:**
```ts
// server, after triggering (never in the browser)
const handle = await tasks.trigger("process-file", payload);
// send handle.id and handle.publicAccessToken to the client

// task file
metadata.set("progress", 0.5); // metadata.increment / metadata.append for counters and logs

// client file: first line "use client";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
const { run } = useRealtimeRun(runId, { accessToken, skipColumns: ["payload", "output"] });
```

**Pitfalls → rules:**
- Secret key in browser code or a `"use client"` file; hooks take only the public token (RT-01)
- Public token with no scopes (no access), `runs: true` in production, or expiry over 30 days (RT-02)
- Status UI built on `useRun` polling with `refreshInterval` (RT-05)
- Status UI without `skipColumns: ["payload", "output"]` sends both with every update (RT-06)
- Metadata over 256 KB: the flush fails and only logs `Failed to flush metadata`; keep state small, bound `append` logs, or move bulk data to streams (TSK-20)

**Docs:** `realtime/overview` · `runs/metadata` · `realtime/auth` · `realtime/react-hooks/subscribe` · `tasks/streams` · `realtime/react-hooks/streams` · `realtime/react-hooks/swr` · `limits#realtime-connections`
