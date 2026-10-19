# Human-in-the-loop and external callbacks (`human-in-the-loop-and-callbacks`)
**You're building:** a run that pauses until a person or external system reports back, then resumes with that payload.  **Not this card if:** the wait is a fixed delay or poll (`long-workflow-waits`), or the approval happens inside a chat turn (`chat: approvals` playbook).

**Primitives:**
- `wait.createToken({ timeout, idempotencyKey, tags })` → `wait.forToken<T>(id)` → `wait.completeToken(id, data)` — because the run pauses until the token is completed, and completion works from the SDK, over HTTP, or from a browser.
- `inputStream.wait()` — because the wait-for-token page says to use it when the data arrives on an input stream.
- `useWaitToken(tokenId, { accessToken })` — because a browser completes the token with `token.publicAccessToken`, with no backend proxy.
- `webhooks.waiter.create` + `webhooks.waiter.wait(waiter).unwrap()` — opt-in only, because a matching provider event resumes the run directly.
  - Rejected: `webhooks.waiter` as default — private beta; fallback: a wait token completed by your own webhook route.
  - Rejected: `token.url` from browser code — server-to-server only, with no CORS headers.

**Gates:** Webhook waiters are **private beta**: enabled per org on request, self-hosted installs need it too, and APIs may change. Cloud limits vary by plan. The pinned wait-token pages show no version or cloud gate.

**Ask only if unknown:**
- Is the callback from a webhook-capable provider, or from a person or your own service? Provider: webhook waiter (opt-in); otherwise: wait token.
- Is the caller on Cloud or self-host? Self-host callers set `TRIGGER_API_URL`; app code never hard-codes the API host.

**Minimal shape:**
```ts
import { wait } from "@trigger.dev/sdk";

// inside run(): create the token BEFORE the external action
const token = await wait.createToken({
  timeout: "10m", // omitted = waits forever
  idempotencyKey: `approval-${orderId}`, // stable business id, never randomUUID
  tags: [`order:${orderId}`],
});
// hand token.id to the external step (browser: token.publicAccessToken)

// in the callback handler: await wait.completeToken(token.id, { approved: true });

const approval = await wait.forToken<ApprovalToken>(token.id).unwrap(); // throws on timeout
```

**Pitfalls → rules:**
- A webhook waiter created after the provider call misses fast events; create it first. (WH-01)
- Browser code fetches `token.url`: no CORS. Use `token.publicAccessToken` with `useWaitToken` or the CORS-enabled complete endpoint. (RT-09)
- No `timeout` means the token waits forever. (RT-10)
- A retried attempt creates a new webhook waiter with no `idempotencyKey` and misses a delivery that already arrived. (WH-02)
- An unchecked `forToken` result hides the timeout error; use `.unwrap()` or check `.ok`.

**Docs:** `wait-for-token` · `realtime/react-hooks/use-wait-token` · `tasks/streams` · `apikeys` · `webhooks/waiters` (web only) · `management/waitpoints/complete` (web only)
