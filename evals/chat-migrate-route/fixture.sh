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
    "@trigger.dev/react-hooks": "4.7.4",
    "ai": "6.0.0",
    "@ai-sdk/react": "3.0.0",
    "@ai-sdk/anthropic": "3.0.0",
    "next-auth": "5.0.0",
    "drizzle-orm": "0.40.0"
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
mkdir -p "$(dirname 'lib/auth.ts')"
cat > 'lib/auth.ts' <<'__EOF__'
export async function getSession(): Promise<{ userId: string } | null> { return null; }
__EOF__
mkdir -p "$(dirname 'db/schema.ts')"
cat > 'db/schema.ts' <<'__EOF__'
import { pgTable, text } from "drizzle-orm/pg-core";
export const chats = pgTable("chats", { id: text("id").primaryKey(), userId: text("user_id").notNull() });
__EOF__
mkdir -p "$(dirname 'app/page.tsx')"
cat > 'app/page.tsx' <<'__EOF__'
export default function Page() { return <main>app</main>; }
__EOF__
touch pnpm-lock.yaml
mkdir -p "$(dirname 'app/api/chat/route.ts')"
cat > 'app/api/chat/route.ts' <<'__EOF__'
import { streamText, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createResumableStreamContext } from "resumable-stream";
export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({ model: anthropic("claude-sonnet-4-5"), messages: convertToModelMessages(messages) });
  return result.toUIMessageStreamResponse();
}
__EOF__
mkdir -p "$(dirname 'components/chat.tsx')"
cat > 'components/chat.tsx' <<'__EOF__'
"use client";
import { useChat } from "@ai-sdk/react";
export function Chat() { const { messages } = useChat({ api: "/api/chat" }); return <div>{messages.length}</div>; }
__EOF__
