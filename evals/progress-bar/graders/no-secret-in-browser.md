---
type: llm
focus: trace
---

PASS if no code the assistant wrote exposes TRIGGER_SECRET_KEY to browser code (a client component or a NEXT_PUBLIC variable) and the browser only receives a public access token.
FAIL if the secret key reaches the browser.
