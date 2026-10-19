# Polyglot caller: Python, Go, Ruby or any backend (`polyglot-caller`)
**You're building:** a non-TypeScript backend that triggers tasks over the REST API; the tasks stay in a TypeScript package.
**Not this card if:** the caller is TypeScript (`background-job`), Python must run inside a task (`heavy-compute`), or the trigger comes from a provider webhook (`webhook-driven`).

**Primitives:**
- Use `POST /api/v1/tasks/{taskIdentifier}/trigger` with `Authorization: Bearer <secret key>` — because it is the server-side trigger call; `options.idempotencyKey` makes a repeat return the existing run ID.
- Read the key from `TRIGGER_SECRET_KEY` in backend env or a secret manager — because keys never belong in source control or frontend code.
- Read the base URL from `TRIGGER_API_URL` (Cloud default when unset) — because self-hosting requires it; never hard-code a host without that override.
- Send `x-trigger-branch: <branch>` only for preview targeting — because it applies only in `preview`/`dev` environments.
- Rejected: `pythonExtension` as a client — because it runs Python scripts inside tasks; it gives a Python backend no trigger call.
- Rejected: a fresh `uuid4()` key per attempt — because each retry then starts a second run.

**Gates:** Cloud-only: restricted key presets and task restrictions; self-hosted keys have no restrictions. No version or beta gate found in the pinned docs. Management pages are web-only.

**Ask only if unknown:**
- Cloud or self-host? Decides whether `TRIGGER_API_URL` is required and whether key presets can narrow access.
- Does Python code run inside a task, or only trigger one? Only the first needs `pythonExtension`.

**Minimal shape:**
```python
import os
import requests

base = os.environ.get("TRIGGER_API_URL", "https://api.trigger.dev")  # Cloud default; self-host sets TRIGGER_API_URL
key = os.environ["TRIGGER_SECRET_KEY"]  # backend env only

def trigger_report(order_id: str, payload: dict) -> dict:
    response = requests.post(
        f"{base}/api/v1/tasks/my-task/trigger",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        json={"payload": payload, "options": {"idempotencyKey": f"report-{order_id}"}},
    )
    response.raise_for_status()
    return response.json()
```

**Pitfalls → rules:**
- A base URL hard-coded with no `TRIGGER_API_URL` override; self-host calls go to the wrong host (RT-11)
- Secret key literal committed in backend config or source (RT-01)
- Random idempotency key per attempt, or none on retries: each retry starts a second run; use a stable business id (TSK-11)
- `pythonExtension` scripts not globbed (`scripts: ["./python/**/*.py"]`), or `requirementsFile` expected in dev (CFG-04)

**Docs:** `management/tasks/trigger` (web only) · `management/authentication` (web only) · `apikeys` · `config/extensions/pythonExtension`
