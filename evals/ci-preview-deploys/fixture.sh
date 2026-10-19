#!/bin/bash
set -e
mkdir -p "$(dirname 'package.json')"
cat > 'package.json' <<'__EOF__'
{
  "name": "svc",
  "private": true,
  "scripts": {
    "deploy:trigger": "trigger deploy"
  },
  "dependencies": {
    "@trigger.dev/sdk": "4.7.4"
  },
  "devDependencies": {
    "trigger.dev": "4.7.4"
  }
}
__EOF__
mkdir -p "$(dirname 'trigger.config.ts')"
cat > 'trigger.config.ts' <<'__EOF__'
import { defineConfig } from "@trigger.dev/sdk";
export default defineConfig({ project: "proj_evalevalevalevaleval", dirs: ["./src/trigger"], maxDuration: 300 });
__EOF__
mkdir -p "$(dirname 'src/trigger/hello.ts')"
cat > 'src/trigger/hello.ts' <<'__EOF__'
import { task } from "@trigger.dev/sdk";
export const hello = task({ id: "hello", run: async (payload: { name: string }) => ({ greeting: `Hello ${payload.name}` }) });
__EOF__
mkdir -p "$(dirname '.github/workflows/deploy.yml')"
cat > '.github/workflows/deploy.yml' <<'__EOF__'
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run deploy:trigger
__EOF__
touch package-lock.json
