// Hook-tier rules (H2). Admission bar: >= 95% precision on public Trigger.dev repos, otherwise demoted to the audit tier.
// Matchers are documented in scripts/lib/lint.mjs. Regexes are written with String.raw.
const R = String.raw;
const WAITS = R`\.triggerAndWait\s*\(|\.batchTriggerAndWait\s*\(|\bbatch\.triggerAndWait\s*\(|\bwait\.(?:for|until|forToken)\s*\(|\bretry\.onThrow\s*\(`;
const HOOKS = R`on(?:Start|StartAttempt|Success|Failure|Wait|Resume|Complete|Cancel)|catchError|handleError`;

export const hookRules = [
  {
    id: "MIG-01", family: "MIG", severity: "warning", tier: "hook", detect: "S", scope: "code", applies_when: "sdk>=4",
    match: { type: "import", from: R`^@trigger\.dev/sdk/v3$` },
    message: 'imports "@trigger.dev/sdk/v3"; with SDK 4 that path still works but is slated for removal',
    fix: 'import from "@trigger.dev/sdk"', fix_mode: "auto", doc: "https://trigger.dev/docs/migrating-from-v3",
    examples: {
      bad: ['import { task } from "@trigger.dev/sdk/v3";\nexport const a = task({ id: "a", run: async () => {} });'],
      good: ['import { task } from "@trigger.dev/sdk";\nexport const a = task({ id: "a", run: async () => {} });'],
    },
  },
  {
    id: "MIG-02", family: "MIG", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: { type: "regex", pattern: R`\b(?:defineJob|eventTrigger)\s*\(`, require: R`@trigger\.dev/` },
    message: "uses the v2 Job API (defineJob/eventTrigger), which no longer exists",
    fix: "rewrite as task({ id, run }) and trigger it with tasks.trigger()", fix_mode: "flag-only", doc: "https://trigger.dev/docs/introduction",
    examples: {
      bad: ['import { TriggerClient } from "@trigger.dev/sdk";\nclient.defineJob({ id: "x", trigger: eventTrigger({ name: "e" }), run: async () => {} });'],
      good: ['import { task } from "@trigger.dev/sdk";\nexport const x = task({ id: "x", run: async () => {} });'],
    },
  },
  {
    id: "MIG-04", family: "MIG", severity: "warning", tier: "hook", detect: "S", scope: "code", applies_when: "sdk>=4",
    match: { type: "regex", pattern: R`\b(?:${HOOKS})\s*(?::\s*(?:async\s*)?|(?=\())\(\s*[A-Za-z_$][\w$]*\s*(?::[^,(){}]+)?\s*,` },
    message: "lifecycle hook uses positional arguments (payload, { ctx }); in SDK 4 hooks receive one object ({ payload, ctx })",
    fix: "change the hook to ({ payload, ctx, ... }) => {}", fix_mode: "flag-only", doc: "https://trigger.dev/docs/migrating-from-v3",
    examples: {
      bad: ['import { task } from "@trigger.dev/sdk";\nexport const a = task({ id: "a", onStart: (payload, { ctx }) => {}, run: async () => {} });',
            'import { task } from "@trigger.dev/sdk";\nexport const a = task({ id: "a", onSuccess: async (payload: P, output) => {}, run: async () => {} });'],
      good: ['import { task } from "@trigger.dev/sdk";\nexport const a = task({ id: "a", onStart: ({ payload, ctx }) => {}, run: async (payload, { ctx }) => {} });'],
    },
  },
  {
    id: "MIG-05", family: "MIG", severity: "warning", tier: "hook", detect: "S", scope: "code", applies_when: "sdk>=4",
    match: { type: "regex", pattern: R`\bctx\.attempt\.(?:id|status)\b|\bctx\.task\.exportName\b` },
    message: "ctx.attempt.id, ctx.attempt.status and ctx.task.exportName were removed in SDK 4 (ctx.attempt.number remains)",
    fix: "use ctx.attempt.number, or drop the field", fix_mode: "flag-only", doc: "https://trigger.dev/docs/migrating-from-v3",
    examples: {
      bad: ['import { task } from "@trigger.dev/sdk";\nexport const a = task({ id: "a", run: async (p, { ctx }) => { console.log(ctx.attempt.id); } });'],
      good: ['import { task } from "@trigger.dev/sdk";\nexport const a = task({ id: "a", run: async (p, { ctx }) => { console.log(ctx.attempt.number); } });'],
    },
  },
  {
    id: "MIG-06", family: "MIG", severity: "error", tier: "hook", detect: "S", scope: "code", applies_when: "sdk>=4",
    match: {
      type: "any", of: [
        { type: "regex", pattern: R`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+[\w.$]+\.batchTrigger\s*\([\s\S]{0,1500}?\b\1\.runs\b` },
        { type: "regex", pattern: R`\(\s*await\s+[\w.$]+\.batchTrigger\s*\([^;]*?\)\s*\)\.runs\b` },
      ],
    },
    message: "batchTrigger() no longer returns the runs list in SDK 4; the handle has no .runs",
    fix: "const b = await batch.retrieve(handle.batchId); then read b.runs", fix_mode: "flag-only", doc: "https://trigger.dev/docs/migrating-from-v3",
    examples: {
      bad: ['import { tasks } from "@trigger.dev/sdk";\nconst handle = await tasks.batchTrigger([[a, { x: 1 }]]);\nconsole.log(handle.runs);'],
      good: ['import { tasks, batch } from "@trigger.dev/sdk";\nconst handle = await tasks.batchTrigger([[a, { x: 1 }]]);\nconst full = await batch.retrieve(handle.batchId);\nconsole.log(full.runs);'],
    },
  },
  {
    id: "MIG-07", family: "MIG", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: { type: "import", from: R`^@trigger\.dev/(?:sdk/build|build)$`, named: R`^defineConfig$` },
    message: 'defineConfig is not exported from "@trigger.dev/sdk/build" or "@trigger.dev/build"',
    fix: 'import { defineConfig } from "@trigger.dev/sdk"', fix_mode: "auto", doc: "https://trigger.dev/docs/config/config-file",
    examples: {
      bad: ['import { defineConfig } from "@trigger.dev/sdk/build";\nexport default defineConfig({ project: "proj_x" });',
            'import { defineConfig } from "@trigger.dev/build";\nexport default defineConfig({ project: "proj_x" });'],
      good: ['import { defineConfig } from "@trigger.dev/sdk";\nimport { prismaExtension } from "@trigger.dev/build/extensions/prisma";\nexport default defineConfig({ project: "proj_x" });'],
    },
  },
  {
    id: "TSK-01", family: "TSK", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: {
      type: "any", of: [
        { type: "call", callee: R`Promise\.(?:all|allSettled|race|any)`, contains: { pattern: WAITS, min: 2 } },
        { type: "call", callee: R`Promise\.(?:all|allSettled|race|any)`, contains: { pattern: WAITS, min: 1 }, containsAlso: R`\.map\s*\(` },
      ],
    },
    message: "more than one wait runs inside Promise.all/allSettled/race (\"Parallel waits are not supported\")",
    fix: "use childTask.batchTriggerAndWait([...]) for fan-out, or await the waits one after another", fix_mode: "flag-only",
    doc: "https://trigger.dev/docs/troubleshooting#parallel-waits-are-not-supported",
    examples: {
      bad: ['import { task } from "@trigger.dev/sdk";\nexport const p = task({ id: "p", run: async () => {\n  const [a, b] = await Promise.all([childA.triggerAndWait({}), childB.triggerAndWait({})]);\n} });',
            'import { task } from "@trigger.dev/sdk";\nexport const p = task({ id: "p", run: async (pl) => {\n  await Promise.all(pl.ids.map((id) => child.triggerAndWait({ id })));\n} });'],
      good: ['import { task } from "@trigger.dev/sdk";\nexport const p = task({ id: "p", run: async (pl) => {\n  await child.batchTriggerAndWait(pl.ids.map((id) => ({ payload: { id } })));\n  await Promise.all([fetchA(), fetchB()]);\n} });',
             'import { task } from "@trigger.dev/sdk";\nexport const p = task({ id: "p", run: async () => {\n  // Promise.all([a.triggerAndWait(), b.triggerAndWait()]) was removed\n  await a.triggerAndWait({});\n} });'],
    },
  },
  {
    id: "SCH-01", family: "SCH", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: { type: "call", callee: R`\bschedules\.create`, lacks: R`\bdeduplicationKey\b` },
    message: "schedules.create() without deduplicationKey adds a new schedule on every call, so the task fires several times",
    fix: "add deduplicationKey (one stable key per schedule and environment)", fix_mode: "flag-only",
    doc: "https://trigger.dev/docs/tasks/scheduled",
    examples: {
      bad: ['import { schedules } from "@trigger.dev/sdk";\nawait schedules.create({ task: "report", cron: "0 9 * * *", externalId: userId });'],
      good: ['import { schedules } from "@trigger.dev/sdk";\nawait schedules.create({ task: "report", cron: "0 9 * * *", externalId: userId, deduplicationKey: `${userId}-report` });'],
    },
  },
  {
    id: "SCH-02", family: "SCH", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: { type: "regex", pattern: R`\bcron\s*:\s*(?:\{[^{}]*?\bpattern\s*:\s*)?["'\x60]\s*(?:[^\s"'\x60]+\s+){5}[^\s"'\x60]+\s*["'\x60]` },
    message: "cron pattern has 6 fields; Trigger.dev cron has 5 (no seconds)",
    fix: "use a 5-field pattern: minute hour day-of-month month day-of-week", fix_mode: "flag-only",
    doc: "https://trigger.dev/docs/tasks/scheduled",
    examples: {
      bad: ['import { schedules } from "@trigger.dev/sdk";\nexport const t = schedules.task({ id: "t", cron: "0 0 9 * * *", run: async () => {} });',
            'import { schedules } from "@trigger.dev/sdk";\nexport const t = schedules.task({ id: "t", cron: { pattern: "*/30 * * * * *", timezone: "UTC" }, run: async () => {} });'],
      good: ['import { schedules } from "@trigger.dev/sdk";\nexport const t = schedules.task({ id: "t", cron: "0 9 * * *", run: async () => {} });',
             'import { schedules } from "@trigger.dev/sdk";\nexport const t = schedules.task({ id: "t", cron: { pattern: "0 9 * * 1-5", timezone: "Europe/Istanbul" }, run: async () => {} });'],
    },
  },
  {
    id: "RT-01", family: "RT", severity: "error", tier: "hook", detect: "S", scope: "any-text", prefilter: R`tr_(?:dev|stg|prod|preview|pat)_|TRIGGER_SECRET_KEY|TRIGGER[A-Z_]*SECRET`,
    match: {
      type: "any", of: [
        { type: "regex", mask: "none", pattern: R`\btr_(?:dev|stg|prod|preview|pat)_(?!(?:x+|X+|\*+|0+|1234|abcd|your|example|placeholder|redacted)[A-Za-z0-9_]*\b)[A-Za-z0-9_]{20,}` },
        { type: "regex", pattern: R`\bTRIGGER_SECRET_KEY\b`, require: R`^\s*["']use client["']` },
        { type: "regex", pattern: R`\b(?:NEXT_PUBLIC|VITE|REACT_APP|PUBLIC|EXPO_PUBLIC)_[A-Z0-9_]*TRIGGER[A-Z0-9_]*SECRET[A-Z0-9_]*` },
      ],
    },
    message: "a Trigger.dev secret key (or a public-prefixed variable holding it) is in source that can reach a browser or git",
    fix: "keep TRIGGER_SECRET_KEY in server-side env only, rotate the exposed key, and give browsers scoped public tokens", fix_mode: "flag-only",
    doc: "https://trigger.dev/docs/apikeys",
    examples: {
      bad: ['const key = "tr_dev_4k8Jd92LpQ7xVz31mNc0aBe5";', '"use client";\nconst k = process.env.TRIGGER_SECRET_KEY;', 'NEXT_PUBLIC_TRIGGER_SECRET_KEY=1'],
      good: ['const key = process.env.TRIGGER_SECRET_KEY;', 'const example = "tr_dev_xxxxxxxxxxxxxxxxxxxxxxxx";', 'TRIGGER_SECRET_KEY="tr_prod_sk_…"'],
    },
  },
  {
    id: "RT-02", family: "RT", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: { type: "call", callee: R`\bauth\.createPublicToken`, lacks: R`\bscopes\b` },
    message: "createPublicToken() without scopes returns a token with no permissions",
    fix: "pass scopes, e.g. { scopes: { read: { runs: [runId] } } }", fix_mode: "flag-only",
    doc: "https://trigger.dev/docs/realtime/auth",
    examples: {
      bad: ['import { auth } from "@trigger.dev/sdk";\nconst t = await auth.createPublicToken();', 'import { auth } from "@trigger.dev/sdk";\nconst t = await auth.createPublicToken({ expirationTime: "1h" });'],
      good: ['import { auth } from "@trigger.dev/sdk";\nconst t = await auth.createPublicToken({ scopes: { read: { runs: [id] } } });'],
    },
  },
  {
    id: "CHT-01", family: "CHT", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: {
      type: "import", from: R`^ai$`, named: R`^streamText$`,
      require: R`\bchat\.agent\s*\(`,
      unless: R`toStreamTextOptions|\{[^{}()]*\bstreamText\b[^{}()]*\}\s*\)\s*(?::[^=]+)?=>`,
    },
    message: 'streamText is imported from "ai" in a chat.agent file; the stock import bypasses the agent\'s managed stream, compaction and steering',
    fix: "destructure streamText from run()'s argument ({ messages, signal, streamText }) or spread ...chat.toStreamTextOptions()", fix_mode: "flag-only",
    doc: "https://trigger.dev/docs/ai-chat/backend#the-managed-streamtext",
    examples: {
      bad: ['import { chat } from "@trigger.dev/sdk/ai";\nimport { streamText } from "ai";\nexport const a = chat.agent({ id: "a", run: async ({ messages }) => streamText({ model, messages }) });'],
      good: ['import { chat } from "@trigger.dev/sdk/ai";\nexport const a = chat.agent({ id: "a", run: async ({ messages, signal, streamText }) => streamText({ model, messages, abortSignal: signal }) });',
             'import { chat } from "@trigger.dev/sdk/ai";\nimport { streamText } from "ai";\nexport const a = chat.agent({ id: "a", run: async ({ messages }) => streamText({ model, messages, ...chat.toStreamTextOptions() }) });'],
    },
  },
  {
    id: "CHT-04", family: "CHT", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: { type: "handler", name: "onChatStart|onPreload", localsFrom: R`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*chat\.local\b`, contains: R`\b{{LOCALS}}\.init\s*\(` },
    message: "a chat.local is initialised in onChatStart/onPreload, which do not run on continuation runs (run() then crashes with \"chat.local can only be modified after initialization\")",
    fix: "initialise chat.local in onBoot", fix_mode: "flag-only", doc: "https://trigger.dev/docs/ai-chat/lifecycle-hooks#onboot",
    examples: {
      bad: ['import { chat } from "@trigger.dev/sdk/ai";\nconst userCtx = chat.local<{ plan: string }>({ id: "userCtx" });\nexport const a = chat.agent({ id: "a", onChatStart: async ({ clientData }) => {\n  userCtx.init({ plan: "pro" });\n}, run: async () => {} });'],
      good: ['import { chat } from "@trigger.dev/sdk/ai";\nconst userCtx = chat.local<{ plan: string }>({ id: "userCtx" });\nexport const a = chat.agent({ id: "a", onBoot: async ({ clientData }) => {\n  userCtx.init({ plan: "pro" });\n}, onChatStart: async () => { await db.insert(); }, run: async () => {} });'],
    },
  },
  {
    id: "CHT-11", family: "CHT", severity: "error", tier: "hook", detect: "S", scope: "code",
    match: { type: "handler", name: "onAction", contains: R`\breturn\s+(?:await\s+)?(?:streamText\s*\(|["'\x60]|\{\s*(?:role|parts|id)\b)` },
    message: "onAction returns a response (streamText result, string or message); an action may only return nothing or chat.turn()",
    fix: "return chat.turn() to answer after the edit", fix_mode: "flag-only", doc: "https://trigger.dev/docs/ai-chat/actions#answering-after-an-action",
    examples: {
      bad: ['import { chat } from "@trigger.dev/sdk/ai";\nexport const a = chat.agent({ id: "a", onAction: async ({ action }) => {\n  chat.history.slice(0, -2);\n  return streamText({ model, messages });\n}, run: async () => {} });'],
      good: ['import { chat } from "@trigger.dev/sdk/ai";\nexport const a = chat.agent({ id: "a", onAction: async ({ action }) => {\n  chat.history.slice(0, -2);\n  return chat.turn();\n}, run: async () => {} });'],
    },
  },
];

// Audit-tier rule written by hand (the drafting run skipped it).
export const handRules = [
  {
    id: "SCH-06", family: "SCH", severity: "info", tier: "audit", detect: "S", scope: "code", target: "cloud",
    match: { type: "regex", pattern: R`\bcron\s*:\s*(?:\{[^{}]*?\bpattern\s*:\s*)?["'\x60]\s*(?:\*|\*/(?:[1-9]|[1-5]\d)|\d+(?:,\d+)+)\s+\S+\s+\S+\s+\S+\s+\S+\s*["'\x60]` },
    message: "cron fires more often than hourly; Trigger.dev Cloud Free rejects schedules more frequent than once an hour",
    fix: "use an hourly or slower cron, or a paid plan", fix_mode: "flag-only", doc: "https://trigger.dev/docs/tasks/scheduled",
    examples: {
      bad: ['import { schedules } from "@trigger.dev/sdk";\nexport const t = schedules.task({ id: "t", cron: "*/15 * * * *", run: async () => {} });',
            'import { schedules } from "@trigger.dev/sdk";\nexport const t = schedules.task({ id: "t", cron: { pattern: "0,30 * * * *", timezone: "UTC" }, run: async () => {} });'],
      good: ['import { schedules } from "@trigger.dev/sdk";\nexport const t = schedules.task({ id: "t", cron: "0 * * * *", run: async () => {} });',
             'import { schedules } from "@trigger.dev/sdk";\nexport const t = schedules.task({ id: "t", cron: "30 9 * * 1-5", run: async () => {} });'],
    },
  },
];
