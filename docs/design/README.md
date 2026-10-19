# Design record

The plan this plugin was built from, written before any code (files 00 to 10). It is kept as the record of *why* each component exists: needs N1 to N14, the audit of the official skills, the hook reasoning, the flows and the walkthroughs.

The build follows it with the deviations listed in [../spikes.md](../spikes.md) (live MCP schema differences, hook matcher details, measured latency). Where the two disagree, `spikes.md` and the code win. Statements such as "the repository URL is a placeholder" in 10 are historical.

| File | Contents |
|---|---|
| [00-overview.md](00-overview.md) | goal, needs, the errors found in the official skills, the five key decisions |
| [01-reference-plugin-analysis.md](01-reference-plugin-analysis.md) | what plugin-swiftui teaches and what transfers |
| [02-official-skills-audit.md](02-official-skills-audit.md) | per-skill audit and where each section went |
| [03-capability-map.md](03-capability-map.md) | scenarios and primitives with doc links |
| [04-plugin-architecture.md](04-plugin-architecture.md) | tree, components, snippets |
| [05-steering-and-hooks.md](05-steering-and-hooks.md) | the three hooks (six answers each) and 14 rejected ones |
| [06-flows-init-consult-audit.md](06-flows-init-consult-audit.md) | init, consult, audit flows and the rule catalog |
| [07-mcp-vs-cli.md](07-mcp-vs-cli.md) | tool inventory, decision matrix, fallbacks |
| [08-doc-link-index.md](08-doc-link-index.md) | link strategy and the seed index |
| [09-scenario-walkthroughs.md](09-scenario-walkthroughs.md) | 13 walkthroughs |
| [10-roadmap-and-open-questions.md](10-roadmap-and-open-questions.md) | phases, evals, risks, open questions |
