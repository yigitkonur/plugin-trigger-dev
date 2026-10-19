---
type: llm
focus: last_message
weight: 2
---

PASS if the answer treats the instance as self-hosted (sets TRIGGER_API_URL in CI) and does not recommend the Trigger.dev Cloud GitHub or Vercel integrations as the way to deploy.
FAIL if it assumes Trigger.dev Cloud.
