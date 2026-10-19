---
type: llm
focus: last_message
weight: 2
---

PASS if the answer proposes measuring before changing anything (run cost and duration from the dashboard, TRQL queries or a health report), names concrete levers (machine size, retries on permanent errors, polling with short waits, debounce) and mentions billing limits or alerts as a dashboard step.
FAIL if it only gives generic cost tips.
