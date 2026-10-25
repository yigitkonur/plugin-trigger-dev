# Webhook-driven automation (`webhook-driven`)
**You're building:** a provider event ("when Stripe sends X, run Y") that is verified, deduplicated and handed to a task.
**Not this card if:** a run waits for a reply → `human-in-the-loop-and-callbacks`; a clock → `scheduled-pipeline`; one event fans out to many items → `fan-out-batch`; a per-user chat session → chat-agent playbooks.

**Primitives:**
- Use `webhooks.endpoint.define({ id, source: webhooks.stripe() })` + `webhook({ endpoint, filter, onEvent })` (SDK ≥ 4.8.0), because Trigger.dev hosts the URL, verifies the signature, records every delivery, deduplicates on the provider's event id and routes each event to the subscribers whose `filter` matches. There is no route to write.
- Use `webhooks.custom()` when the provider has no preset; set `idempotencyField` so a retry maps to the same key.
- Fall back to your own route + `tasks.trigger(…, { idempotencyKey: event.id })` when the SDK is older than 4.8.0 and the user does not want to upgrade now, or the endpoint must live on your own domain. Then verify the signature over the raw body before parsing, because nothing verifies it on that path.
- Rejected: `triggerAndWait` in a route — because the route should only acknowledge; the work runs in the task.

**Gates:** Hosted webhooks (`webhooks.endpoint.define`, `webhook()`, `chat.event`, channels, waiters) need SDK ≥ 4.8.0 (private beta before; generally available since). Offer `npx trigger.dev@latest update` when the project is older. The endpoint's signing secret is a separate step: the dashboard Webhooks page shows "Needs secret" until it is set, and every delivery is rejected until then. Self-host: set `TRIGGER_API_URL`; hosted webhooks are off until the operator sets `WEBHOOK_ENABLED=1` with a Redis cluster and the `hasWebhooksAccess` flag (`self-hosting/env/webapp#webhooks`), so ask the operator or use the route path, which has no version gate.

**Ask only if unknown:**
- Is the SDK ≥ 4.8.0 (the facts line says)? Changes hosted endpoint vs own route.
- Does the provider send a stable event id, and in which field or header? Changes the `idempotencyKey` source; with none, use a stable business id.

**Minimal shape (hosted):**
```ts
import { webhook, webhooks } from "@trigger.dev/sdk";

export const stripe = webhooks.endpoint.define({ id: "stripe", source: webhooks.stripe() });

export const fulfillOrder = webhook({
  id: "fulfill-order",
  endpoint: stripe,
  filter: "event.type == 'checkout.session.completed'",
  onEvent: async ({ event }) => {
    // event is verified; deliveries of one provider event id are deduplicated
  },
});
```
Then deploy (or `trigger dev`), copy the URL from the Webhooks page into the provider, and set the signing secret (MCP `set_webhook_secret` / `generate_webhook_secret`, or the dashboard). Check arrival with `list_webhook_deliveries`.

**Fallback shape (own route, SDK < 4.8 or own domain):**
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
- The signing secret never goes in code or chat: `generate_webhook_secret` returns it once, and the guard always asks before `set_webhook_secret` or `generate_webhook_secret`
- Custom source (`webhooks.custom`) without `idempotencyField` derives its key from body, timestamp and signature, which can change on retry (WH-02)
- Event types are compile-time only, and filters aren't security: a throwing filter still routes the event, so validate in the handler (WH-04)

**Docs:** https://trigger.dev/docs/idempotency · https://trigger.dev/docs/webhooks/overview · https://trigger.dev/docs/webhooks/sources · https://trigger.dev/docs/webhooks/connect · https://trigger.dev/docs/webhooks/filters · https://trigger.dev/docs/webhooks/deliveries · https://trigger.dev/docs/self-hosting/env/webapp#webhooks · https://trigger.dev/docs/apikeys
