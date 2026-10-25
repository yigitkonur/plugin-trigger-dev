# Deploy, CI and environments (`deploy-ci`)
**You're building:** CI deploys that give each environment its own token and pin every run to the commit that shipped it.  **Not this card if:** you're writing task code (`background-job`) or reading live run health (the `diagnose` skill).

**Primitives:**
- `npx trigger.dev@latest deploy --external-id <sha>` — because the id is opaque to Trigger.dev, so a re-run of the same commit reuses its build and runs pin to that deployment.
- `TRIGGER_EXTERNAL_DEPLOYMENT_ID` in the app — because pinning needs the app to send the same id with every trigger.
- `TRIGGER_ACCESS_TOKEN` per environment — because the key must belong to the environment the deploy targets.
- Always write `--env <name>` (or `--prod`) on `deploy` and `promote`, because the CLI (≥ 4.7.5) names the target and, when `TRIGGER_ACCESS_TOKEN` is an environment API key, uses that key's environment for an omitted `--env`; older CLIs assume prod.
- `deploy --env preview` — because each PR gets a preview branch that archives when the PR closes.
- `dev --branch <name>` / `TRIGGER_DEV_BRANCH` — because each branch is its own dev session, for parallel worktrees and agents.
- `syncEnvVars` build extension — because it syncs variables during `deploy`, before the build starts, and `trigger dev` does not run it; set other values with `env set --env <env>` (defaults to prod).
- Rejected: `${{ github.sha }}` on PR workflows — because on `pull_request` it is the merge commit; use `github.event.pull_request.head.sha`.
- Rejected: `syncVercelEnvVars` — because the pinned Vercel page marks it deprecated; remove it.

**Gates:** Version skew protection (external deployment ids) needs SDK and CLI ≥ 4.5.12 on both sides. Preview branches are Cloud-only and plan-limited (Free 0 active, Hobby 5, Pro 20). GitHub and Vercel integrations are Cloud-only. Self-host CI deploys must set `TRIGGER_API_URL`. No beta features here. A leaked key is regenerated in the dashboard (API keys), where the previous key can be revoked at once instead of living 24 more hours; a deployed task keeps the runtime it was built with, so security releases need a redeploy (a custom base image keeps its own trust store from 4.8.1, `self-hosting/overview`).

**Ask only if unknown:**
- Cloud or self-host? — self-host needs `TRIGGER_API_URL` in CI, and the integrations are unavailable.
- Does the app ship separately from the tasks? — if yes, use the external-id pair on both sides, because they are never live at the same instant.

**Minimal shape:**
```yaml
# package.json: devDependency "trigger.dev" at the SDK version; script "deploy:trigger": "trigger deploy --env prod"
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Deploy Trigger.dev (prod)
        env:
          TRIGGER_ACCESS_TOKEN: ${{ secrets.TRIGGER_ACCESS_TOKEN_PROD }}
        run: npm run deploy:trigger -- --external-id ${{ github.sha }}
```

**Pitfalls → rules:**
- Deploy job without `TRIGGER_ACCESS_TOKEN`, or one token shared by all environments (DEP-01, DEP-02)
- PR workflow uses `${{ github.sha }}` as the external id (DEP-04)
- Preview workflow without `closed` in `pull_request.types`, so preview branches never archive (DEP-03)
- `paths:` filter with a sha-based id: a run pinned to a deployment that never lands expires after 1 h (DEP-05)
- Stale `TRIGGER_VERSION` in app or hosting env: every trigger fails with a 422 (DEP-06)

**Docs:** https://trigger.dev/docs/deployment/overview · https://trigger.dev/docs/github-actions · https://trigger.dev/docs/deploy-environment-variables · https://trigger.dev/docs/deployment/atomic-deployment · https://trigger.dev/docs/deployment/preview-branches · https://trigger.dev/docs/deployment/dev-branches · https://trigger.dev/docs/github-integration · https://trigger.dev/docs/vercel-integration · https://trigger.dev/docs/cli-env-commands
