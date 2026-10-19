// Server-side only. Starts a run and hands the browser a read-only token for that ONE run.
// Authorise the caller before minting: the runId must come from your own records, never from the client.
import { auth, tasks } from "@trigger.dev/sdk";

export async function startAndMint(userId: string) {
  // The secret key (TRIGGER_SECRET_KEY) stays on the server; the browser only ever sees the scoped token.
  const handle = await tasks.trigger("example", { name: userId }, { idempotencyKey: `start-${userId}` });
  const token = await auth.createPublicToken({
    scopes: { read: { runs: [handle.id] } }, // no scopes would mean a token with no permissions
    expirationTime: "1h",
  });
  return { runId: handle.id, token };
}
