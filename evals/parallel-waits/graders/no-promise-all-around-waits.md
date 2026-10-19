---
type: regex
pattern: 'Promise\.(?:all|allSettled)\([^)]{0,300}(?:triggerAndWait|batchTriggerAndWait)'
match: not_contains
target: trace
weight: 2
---
