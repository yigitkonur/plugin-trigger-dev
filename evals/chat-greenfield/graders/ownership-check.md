---
type: llm
focus: trace
weight: 2
---

PASS if the server actions or route code the assistant wrote verify that the signed-in user owns the chatId before issuing a session or token (for example by loading the chat by id and owner, or comparing userId), or the final message states that this check is required and shows it.
FAIL if the actions mint tokens or start sessions for any chatId without such a check.
