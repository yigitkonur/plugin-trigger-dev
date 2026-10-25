---
type: regex
pattern: 'constructEvent|createHmac|stripe-signature'
match: not_contains
target: trace
weight: 1
---
