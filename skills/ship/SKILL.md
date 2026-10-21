---
name: ship
description: Deploy Trigger.dev tasks (trigger deploy) to staging, prod or a preview branch with a preflight, the right CI or integration pipeline, an explicit --env, and a verification step. Use when asked to deploy, ship or release the Trigger.dev tasks or jobs. Not for deploying the app itself to Vercel, Fly or another host.
argument-hint: "[staging|prod|preview]"
allowed-tools: Bash(trigger-ctx *) Bash(node *trigger-ctx.mjs *) Bash(git status *) Bash(git branch --show-current)
---

# Ship Trigger.dev tasks ($ARGUMENTS)

## Project facts

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs" detect --brief || true`

Read `${CLAUDE_PLUGIN_ROOT}/skills/build/scenarios/deploy-ci.md` first. Deploys touch production: the target environment is always explicit (`--env`), and a production deploy needs the user's yes in this conversation. If no environment was given, ask: staging, prod or preview.

## Steps

1. **Preflight.** Run `trigger-ctx scan --focus deploy --json`. Fix or report: version drift between `trigger.dev` and `@trigger.dev/*` (CI fails on a mismatch); imports whose extension is missing (browser, Prisma `mode` and a generate step, ffmpeg with `fluent-ffmpeg` external, Python scripts, native modules as `build.external`); `process.env.X` read under `dirs` that is not set in the target environment (`npx trigger.dev env list --env <e>`, without `--show-values`); secrets in code or payloads; a default `maxDuration`; the `--env-file` misbelief (it only hydrates the CLI process).
2. **Pipeline.** Infer from `.github/workflows` and `vercel.json`; ask once if unclear: manual CLI · GitHub Actions (a `TRIGGER_ACCESS_TOKEN` per environment, deploy through the devDependency script, `--external-id` with the commit sha and the PR head sha on pull requests, a preview workflow listening for `opened, synchronize, reopened, closed`) · GitHub integration (config path when there is more than one config, a pre-build step for Prisma generate) · Vercel integration (needs the GitHub integration; remove `syncVercelEnvVars`) · preview branches (the integration **or** Actions, never both). Integrations and key presets are Cloud features: skip them on a self-hosted target.
3. **Version skew.** If the app is deployed separately from the tasks, set `TRIGGER_EXTERNAL_DEPLOYMENT_ID` or `configure({ externalDeploymentId })`. Watch for `paths:` filters, two apps sharing a project, and a stale `TRIGGER_VERSION`.
4. **Deploy** with the project's own CLI and an explicit environment: `pnpm exec trigger deploy --env <e>` (or `npx trigger deploy --env <e>`). Run `--dry-run` first when extensions changed. On `resource_exhausted` retry with `--native-build`.
5. **Verify.** MCP `list_deploys` (explicit environment) shows the new version; `get_current_worker` in that environment lists the tasks; optionally a smoke `trigger_task` in staging (ask first); `get_report` (health) for that environment. Show the version and the dashboard link. If anything could not be checked, say UNVERIFIED and why.
6. **Rollback** is `promote <previous version> --env <e>`. If the project has chat agents, warn that the chat transcript format is roll-forward only.

## Human gates (name them, don't work around them)

API key creation (shown once), adding a GitHub secret, the GitHub App or Vercel OAuth, dashboard build settings, billing limits.
