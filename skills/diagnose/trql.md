# TRQL query ideas

Write the exact SQL only after `get_query_schema` (table and column names are the server's, not this file's). Pass `environment` and a `period`; the lookback is clipped by plan. Status values are title case in TRQL (`'Failed'`), upper case in the SDK. Docs: https://trigger.dev/docs/observability/query.

- failed runs with their errors, last 24 hours
- success rate per task per day
- p50 and p95 `usage_duration` per task
- the most expensive runs, and cost per task
- runs by queue and machine
- memory per task, last 7 days (compare with the machine preset)
- the CPU timeline of one run
- 429 denials per minute
- runs with more than three attempts (retry storms)
- one tenant's runs through a tag such as `has(tags, 'user_…')`
- queue latency: `executed_at - triggered_at`, p95
- metric discovery: list what the schema offers before guessing
