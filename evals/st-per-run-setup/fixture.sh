#!/bin/bash
set -e
mkdir -p "$(dirname 'package.json')"
cat > 'package.json' <<'__EOF__'
{
  "name": "shop",
  "private": true,
  "scripts": {
    "dev": "next dev"
  },
  "dependencies": {
    "next": "16.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zod": "3.25.76",
    "@trigger.dev/sdk": "4.7.4"
  },
  "devDependencies": {
    "@trigger.dev/build": "4.7.4",
    "trigger.dev": "4.7.4",
    "typescript": "5.6.0"
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
mkdir -p "$(dirname 'tsconfig.json')"
cat > 'tsconfig.json' <<'__EOF__'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src",
    "lib",
    "trigger.config.ts"
  ]
}
__EOF__
touch pnpm-lock.yaml
mkdir -p "$(dirname 'lib/db.ts')"
cat > 'lib/db.ts' <<'__EOF__'
export async function connect() { return { query: async (sql: string) => [] as unknown[], close: async () => {} }; }
__EOF__
