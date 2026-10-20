---
type: regex
pattern: 'Promise\.all\([^)]*(?:triggerAndWait|batchTriggerAndWait|wait\.for)'
match: not_contains
target: trace
---
