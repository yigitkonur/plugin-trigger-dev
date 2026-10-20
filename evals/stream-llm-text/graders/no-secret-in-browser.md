---
type: regex
pattern: 'NEXT_PUBLIC_\w*(?:SECRET|TRIGGER_SECRET)'
match: not_contains
target: trace
---
