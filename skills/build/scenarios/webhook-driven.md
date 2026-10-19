# Webhook-driven automation (`webhook-driven`)
**You're building:** a provider event ("when Stripe sends X, run Y") that is verified, deduplicated and handed to a task.
**Not this card if:** a run waits for a reply → `human-in-the-loop-and-callbacks`; a clock → `scheduled-pipeline`; one event fans out to many items → `fan-out-batch`; a per-user chat session → chat-agent playbooks.

**Primitives:**
- Use `tasks.trigger(…, { idempotencyKey })` per delivery, because redeliveries of one event carry the same provider event id and return the existing run.
- Verify the provider signature over the raw body before parsing, because nothing verifies it on this path.
- Rejected as default: `webhooks.endpoint.define` + `webhook()` — because it is private beta; use it only once access is confirmed, and keep the route as fallback.
- Rejected: `triggerAndWait` in the route — because the route should only acknowledge; the work runs in the task.

**Gates:** Hosted webhooks (`webhooks.endpoint.define`, `webhook()`, `chat.event`, channels, waiters) are private beta: gated per organisation, APIs may change before GA, docs are web only. Not cloud-only: self-hosted orgs can get access too. The route path has no beta gate; self-host it with `TRIGGER_API_URL` (or `baseURL` in `configure`).

**Ask only if unknown:**
- Is the org in the hosted-webhooks beta? Ask, or check whether the MCP webhook tools (`list_webhook_endpoints`) respond. Changes whether the hosted path is offered; the route stays the default.
- Does the provider send a stable event id, and in which field or header? Changes the `idempotencyKey` source; with none, use a stable business id.

**Minimal shape:**
```ts
import { tasks } from "@trigger.dev/sdk";

export async function POST(req: Request) {
  const rawBody = await req.text();
  // verify the provider signature over rawBody here, before parsing
  const event = JSON.parse(rawBody);
  // trigger, don't triggerAndWait: acknowledge fast, the work runs in the task
  await tasks.trigger("handle-provider-event", event, {
    idempotencyKey: event.id, // provider event id
  });
  return new Response(null, { status: 200 });
}
```

**Pitfalls → rules:**
- Route triggers before the signature check, so forged events can start runs.
- Route passes no provider event id as `idempotencyKey`, so redeliveries can start duplicate runs (WH-06)
- Endpoint "Needs secret" rejects every delivery; check with MCP `list_webhook_endpoints` (WH-03)
- Custom source (`webhooks.custom`) without `idempotencyField` derives its key from body, timestamp and signature, which can change on retry (WH-02)
- Event types are compile-time only, and filters aren't security: a throwing filter still routes the event, so validate in the handler (WH-04)

**Docs:** `idempotency` · `webhooks/overview` (web only) · `webhooks/sources` (web only) · `webhooks/connect` (web only) · `webhooks/filters` (web only) · `webhooks/deliveries` (web only) · `apikeys`
