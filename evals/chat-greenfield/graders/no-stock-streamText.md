---
type: regex
pattern: 'import\s*\{[^}]*streamText[^}]*\}\s*from\s*\\"ai\\"'
match: not_contains
target: trace
weight: 2
---
