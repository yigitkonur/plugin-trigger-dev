# Realtime: token route and progress component

Pattern: the server starts (or looks up) a run, checks the caller owns it, and mints a **read-scoped public token for that one run**. The browser subscribes with that token and never sees the secret key. Files: `realtime/token-route.ts` (server) and `realtime/progress.tsx` (client, React). Docs: https://trigger.dev/docs/realtime/auth · https://trigger.dev/docs/realtime/react-hooks/subscribe · https://trigger.dev/docs/runs/metadata.

- The task reports progress with `metadata.set("progress", n)`; metadata is capped at 256 KB per run.
- A token created without `scopes` has no permissions; `runs: true` reads every run (debugging only).
- Hooks need `"use client"` in App Router frameworks.
- For a browser that starts the work, mint a trigger token with `auth.createTriggerPublicToken("task-id")` instead and use `useTaskTrigger`.
