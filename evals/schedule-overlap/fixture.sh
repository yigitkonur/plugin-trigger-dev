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
    "@trigger.dev/sdk": "4.7.4",
    "@trigger.dev/react-hooks": "4.7.4"
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
mkdir -p "$(dirname 'src/trigger/process-video.ts')"
cat > 'src/trigger/process-video.ts' <<'__EOF__'
import { task, metadata } from "@trigger.dev/sdk";
export const processVideo = task({ id: "process-video", run: async (payload: { videoId: string }) => { for (let i = 1; i <= 10; i++) { /* work */ } return { ok: true }; } });
__EOF__
mkdir -p "$(dirname 'app/api/hello/route.ts')"
cat > 'app/api/hello/route.ts' <<'__EOF__'
import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const order = await req.json();
  // TODO: create the order
  return NextResponse.json({ ok: true, order });
}
__EOF__
mkdir -p "$(dirname 'app/page.tsx')"
cat > 'app/page.tsx' <<'__EOF__'
export default function Page() { return <main>shop</main>; }
__EOF__
touch pnpm-lock.yaml
