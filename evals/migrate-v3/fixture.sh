#!/bin/bash
set -e
mkdir -p "$(dirname 'package.json')"
cat > 'package.json' <<'__EOF__'
{
  "name": "legacy",
  "private": true,
  "dependencies": {
    "@trigger.dev/sdk": "3.3.17"
  }
}
__EOF__
mkdir -p "$(dirname 'trigger.config.ts')"
cat > 'trigger.config.ts' <<'__EOF__'
import { defineConfig } from "@trigger.dev/sdk/v3";
export default defineConfig({ project: "proj_legacylegacylegacy", dirs: ["./src/trigger"] });
__EOF__
mkdir -p "$(dirname 'src/trigger/send.ts')"
cat > 'src/trigger/send.ts' <<'__EOF__'
import { task } from "@trigger.dev/sdk/v3";
export const send = task({ id: "send", handleError: async (payload, error, { ctx }) => {}, run: async (payload: { to: string }, { ctx }) => { console.log(ctx.attempt.id); } });
__EOF__
