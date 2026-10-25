#!/usr/bin/env node
// What changed upstream since this plugin was last reconciled, and which plugin files each change touches.
// usage: node scripts/ci/upstream-check.mjs [--write] [--json]
//   exit 0 = up to date, 1 = newer upstream versions or changes exist (the weekly job reports this), 2 = could not reach the network
//   --write  record the newest versions in references/upstream.json (run it only after you reconciled the plugin)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmpVersion } from "../lib/util.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = path.join(root, "references", "upstream.json");
const up = JSON.parse(fs.readFileSync(file, "utf8"));
const asJson = process.argv.includes("--json");

// release-note keyword -> where it lands in this plugin (the same map AGENTS.md "Where each kind of change lands" explains)
const LANDS = [
  [/\b(deploy|promote|--env|--prod|environment key|preview branch)\b/i, "scripts/lib/guard.mjs (CLI + MCP tables), skills/ship/SKILL.md, skills/build/scenarios/deploy-ci.md, references/mcp-vs-cli.md"],
  [/\bMCP\b|\bcreate_\w+|\blist_\w+|\bget_\w+_tool|\btool\b/i, "scripts/ci/mcp-tools.snapshot.json, scripts/lib/guard.mjs, agents/run-investigator.md, references/mcp-vs-cli.md"],
  [/\bchat\b|\bagent\b|\bchannel|\bsession|\bslack\b|\blinear\b/i, "skills/chat-agent/** (SKILL.md + playbooks), references/link-index.md"],
  [/\bwebhook/i, "skills/build/scenarios/webhook-driven.md, human-in-the-loop-and-callbacks.md, scripts/rules/src/WH-rules.json"],
  [/\bwait\b|waitpoint|token\b/i, "skills/build/scenarios/long-workflow-waits.md, human-in-the-loop-and-callbacks.md"],
  [/\brealtime|stream|subscribe|react-hooks/i, "skills/build/scenarios/progress-ui.md, scripts/rules/src/RT-rules.json"],
  [/\bqueue|concurrency|batch|idempoten|debounce/i, "skills/build/scenarios/fan-out-batch.md, background-job.md, scripts/rules/src"],
  [/\bschedule|cron\b/i, "skills/build/scenarios/scheduled-pipeline.md"],
  [/\bextension|puppeteer|playwright|python|ffmpeg|prisma|build\b|esbuild|bundl/i, "skills/build/scenarios/heavy-compute.md, scripts/rules/src/CFG-rules.json"],
  [/\bmachine|memory|OOM|cost|price|billing/i, "skills/build/scenarios/cost-sensitive.md, oom-bigger-machine eval"],
  [/\bdeprecat|renam|removed|breaking|no longer/i, "references/traps.md, scripts/rules/src (MIG-*), scripts/ci/sdk-surface.mjs output"],
  [/\bsecurity|CVE|certificate|CA\b|Node\.js \d/i, "skills/ship/SKILL.md (redeploy note), skills/diagnose/symptoms.md"],
  [/\bdev\b.*\b(agent|Claude|Cursor|Codex)|\btasks trigger|\bCLI\b/i, "skills/build/verify.md, references/mcp-vs-cli.md, skills/init/SKILL.md"],
  [/\btelemetry|otel|span|trace|observab|alert|dashboard|query|TRQL/i, "skills/diagnose/**, references/link-index.md, agents/run-investigator.md"],
];

async function j(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: process.env.GITHUB_TOKEN && url.includes("github") ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {} });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

let latest = {};
let releases = [];
try {
  for (const p of up.packages) latest[p] = (await j(`https://registry.npmjs.org/${p.replace("/", "%2f")}/latest`)).version;
  releases = await j(`https://api.github.com/repos/${up.releases}/releases?per_page=40`);
} catch (e) {
  console.error(`upstream-check: network problem: ${e.message}`);
  process.exit(2);
}

const base = up.reconciledWith.sdk;
const newer = releases
  .map((r) => ({ tag: r.tag_name, v: (/^v(\d+\.\d+\.\d+)$/.exec(r.tag_name) || [])[1], body: r.body || "", url: r.html_url, date: r.published_at }))
  .filter((r) => r.v && cmpVersion(r.v, base) === 1)
  .sort((a, b) => cmpVersion(a.v, b.v));

const bumps = Object.entries(latest).filter(([p, v]) => v && cmpVersion(v, up.reconciledWith[p === "trigger.dev" ? "cli" : "sdk"]) === 1).map(([p, v]) => ({ package: p, from: up.reconciledWith[p === "trigger.dev" ? "cli" : "sdk"], to: v }));

const items = [];
for (const r of newer) {
  for (const line of r.body.split("\n")) {
    const m = /^\s*[-*]\s+(.*)/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/\(\[`?[0-9a-f]{7,}`?\]\([^)]*\)\)/g, "").trim();
    if (text.length < 20) continue;
    const lands = [...new Set(LANDS.filter(([re]) => re.test(text)).map(([, f]) => f))];
    items.push({ version: r.v, text: text.slice(0, 300), lands });
  }
}

const drift = bumps.length > 0 || newer.length > 0;
const out = { reconciledWith: up.reconciledWith, latest, bumps, releasesSince: newer.map((r) => ({ v: r.v, url: r.url, date: r.date })), items };
if (asJson) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`reconciled with SDK ${base} on ${up.reconciledWith.date}; npm latest: ${Object.entries(latest).map(([p, v]) => `${p} ${v}`).join(", ")}`);
  if (!drift) console.log("up to date: no newer release.");
  for (const b of bumps) console.log(`NEWER ${b.package}: ${b.from} -> ${b.to}`);
  for (const r of newer) console.log(`release ${r.v} (${r.date?.slice(0, 10)}) ${r.url}`);
  for (const i of items) console.log(`\n[${i.version}] ${i.text}\n   -> ${i.lands.length ? i.lands.join("\n   -> ") : "no mapped file: read the note and decide"}`);
}

if (process.argv.includes("--write")) {
  const lastSdk = latest["@trigger.dev/sdk"];
  up.reconciledWith = { ...up.reconciledWith, date: new Date().toISOString().slice(0, 10), sdk: lastSdk, cli: latest["trigger.dev"] };
  fs.writeFileSync(file, JSON.stringify(up, null, 2) + "\n");
  console.log(`\nwrote references/upstream.json (sdk ${lastSdk}). Update mcpToolCount by hand if the MCP snapshot changed.`);
  process.exit(0);
}
process.exit(drift ? 1 : 0);
