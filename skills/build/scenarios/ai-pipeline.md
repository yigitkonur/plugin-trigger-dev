# AI pipeline, not chat (`ai-pipeline`)
**You're building:** summarise, classify, extract or generate over documents as LLM task chains with no chat UI.  **Not this card if:** multi-turn chat (route to the `chat-agent` skill) · no LLM call (`background-job`) · one run fanning out over many items (`fan-out-batch`).

**Primitives:**
- `schemaTask` — because its `schema` doubles as the LLM tool's `inputSchema`.
- `ai.toolExecute(task)` inside `tool({…})`, from `@trigger.dev/sdk/ai` — because tool types follow your own installed `ai` version.
- Rejected: `ai.tool(task)` — deprecated, may be removed in a future major.
- `streams.define<string>({ id })` + `.pipe(result.textStream)` — because one typed definition serves both the task and the UI.
- Rejected: `streams.pipe("id", …)` — the docs strongly recommend `define` over direct methods.
- `prompts.define({ … })` — because versions are created on deploy and dashboard overrides need no redeploy.
- Rejected: prompt string literal — no link from spans to a prompt version.
- `experimental_telemetry: { isEnabled: true }` on each call — because every generation becomes a run-trace span and `llm_metrics` gives cost.

**Gates:** version: AI SDK 7 needs `@ai-sdk/otel` installed and registered once (AI SDK 6 needs nothing). Beta: none in this card. Cloud-only: none stated; prompt resolve calls the Trigger.dev API (self-host: `TRIGGER_API_URL`).

**Ask only if unknown:** Which AI SDK major is installed? (7 adds the `@ai-sdk/otel` step.) Must production output stay pinned to one prompt version? (Yes: `resolve(vars, { version: N })`. No: a dashboard override changes prod with no deploy.)

**Minimal shape:**
```ts
import { schemaTask } from "@trigger.dev/sdk";
import { ai } from "@trigger.dev/sdk/ai";
import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
export const summarise = schemaTask({
  id: "summarise",
  schema: z.object({ text: z.string() }),
  run: async ({ text }) => {
    const { text: summary } = await generateText({ model: openai("gpt-4o"), prompt: `Summarise:\n\n${text}`, experimental_telemetry: { isEnabled: true } });
    return { summary };
  },
});
export const summariseTool = tool({ description: summarise.description ?? "", inputSchema: summarise.schema!, execute: ai.toolExecute(summarise) });
```

**Pitfalls → rules:**
- Retries re-run the LLM call and any write, email or charge in `run()`; key provider calls with `ctx.run.id` or a business id (TSK-10).
- Bad input or unusable model output burns retries; throw `AbortTaskRunError` for permanent failures and plain `Error` for transient ones (TSK-09, COST-02).
- Whole documents in the payload bloat runs; pass a reference and load the text inside the task (TSK-19).
- A dashboard prompt override changes prod output with no deploy; `resolve(vars, { version: N })` takes priority over it (no rule id).
- AI SDK 7 without `@ai-sdk/otel` emits no generation spans (CHT-21).

**Docs:** `tasks/schemaTask` · https://trigger.dev/docs/ai/prompts · https://trigger.dev/docs/ai/observability · https://trigger.dev/docs/tasks/streams · https://trigger.dev/docs/errors-retrying
