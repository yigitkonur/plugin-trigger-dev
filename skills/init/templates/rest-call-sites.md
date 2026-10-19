# REST call sites (any backend)

Trigger a task over HTTP with the **secret key** for the target environment. Keep the key and the API URL in the environment: `TRIGGER_SECRET_KEY` and, only on a self-hosted instance, `TRIGGER_API_URL`. The task itself is TypeScript (a `trigger/` subpackage, see `polyglot-subpackage/`). Endpoint docs: https://trigger.dev/docs/management/tasks/trigger · auth: https://trigger.dev/docs/management/authentication · idempotency: https://trigger.dev/docs/idempotency.

Request: `POST {API_URL}/api/v1/tasks/{taskId}/trigger`, header `Authorization: Bearer <secret key>`, JSON body `{ "payload": …, "options": { "idempotencyKey": "<stable business id>" } }`. The response body carries the run `id`. Use a key built from a stable id (an order id, a webhook event id), never a random value, so a retry does not start a second run.

## curl

```bash
curl -sS -X POST "${TRIGGER_API_URL:-https://api.trigger.dev}/api/v1/tasks/example/trigger" \
  -H "Authorization: Bearer $TRIGGER_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"payload":{"name":"Ada"},"options":{"idempotencyKey":"order-123"}}'
```

## Python (requests)

```python
import os, requests

def trigger(task_id: str, payload: dict, key: str) -> str:
    base = os.environ.get("TRIGGER_API_URL", "https://api.trigger.dev")
    r = requests.post(
        f"{base}/api/v1/tasks/{task_id}/trigger",
        headers={"Authorization": f"Bearer {os.environ['TRIGGER_SECRET_KEY']}"},
        json={"payload": payload, "options": {"idempotencyKey": key}},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["id"]
```

## Go

```go
func trigger(taskID string, payload any, key string) (string, error) {
	base := os.Getenv("TRIGGER_API_URL")
	if base == "" {
		base = "https://api.trigger.dev"
	}
	body, _ := json.Marshal(map[string]any{"payload": payload, "options": map[string]any{"idempotencyKey": key}})
	req, _ := http.NewRequest("POST", base+"/api/v1/tasks/"+taskID+"/trigger", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("TRIGGER_SECRET_KEY"))
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	var out struct{ ID string `json:"id"` }
	return out.ID, json.NewDecoder(res.Body).Decode(&out)
}
```

## Ruby

```ruby
require "net/http"; require "json"

def trigger(task_id, payload, key)
  base = ENV.fetch("TRIGGER_API_URL", "https://api.trigger.dev")
  req = Net::HTTP::Post.new(URI("#{base}/api/v1/tasks/#{task_id}/trigger"),
    "Authorization" => "Bearer #{ENV.fetch('TRIGGER_SECRET_KEY')}", "Content-Type" => "application/json")
  req.body = { payload: payload, options: { idempotencyKey: key } }.to_json
  res = Net::HTTP.start(req.uri.hostname, req.uri.port, use_ssl: req.uri.scheme == "https") { |h| h.request(req) }
  JSON.parse(res.body)["id"]
end
```

Check the status before using the body in production code (a 4xx means the task id, key or payload is wrong). For results, subscribe from the browser with a public token (`realtime-token-route.md`) or poll the run endpoint from a backend.
