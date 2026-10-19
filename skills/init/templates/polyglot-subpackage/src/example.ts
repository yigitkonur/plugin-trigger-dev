import { task } from "@trigger.dev/sdk";

// Triggered over REST from the host language (see ../rest-call-sites.md). Replace the body with the real work.
export const example = task({
  id: "example",
  run: async (payload: { name: string }) => {
    return { greeting: `Hello ${payload.name}` };
  },
});
