#!/usr/bin/env node
// Weekly freshness checks that need the network:
//  (3) coverage: every page in references/link-index.md still exists in llms.txt; pages new in llms.txt are listed (informational)
//  (4) local parity: rows marked L have their first page bundled in the latest @trigger.dev/sdk tarball
//  (5) staleness: occurrences of the deprecated names from references/traps.md in the latest bundled docs (report only)
// usage: node scripts/ci/docs-parity.mjs   (exit 1 on a failed check 3 or 4)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseIndex } from "../lib/docs.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rows = parseIndex(fs.readFileSync(path.join(root, "references", "link-index.md"), "utf8"));
let failed = 0;

const llms = await (await fetch("https://trigger.dev/docs/llms.txt")).text();
const listed = new Set([...llms.matchAll(/https:\/\/trigger\.dev\/docs\/([^\s)]+?)(?:\.md)?(?=[\s)])/g)].map((m) => m[1]));
const indexed = new Set(rows.flatMap((r) => r.pages.map((p) => p.split("#")[0])));
const gone = [...indexed].filter((p) => !listed.has(p));
console.log(`(3) coverage: ${indexed.size} indexed pages, ${listed.size} pages in llms.txt, ${gone.length} indexed pages missing from llms.txt`);
for (const p of gone) console.log(`    MISSING ${p}`);
if (gone.length) failed++;
const fresh = [...listed].filter((p) => !indexed.has(p) && !/^(ai-chat\/patterns|guides|self-hosting|community|changelog|video)/.test(p));
console.log(`    ${fresh.length} pages in llms.txt are not in the index (informational), first 15: ${fresh.slice(0, 15).join(", ")}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdp-sdk-"));
execFileSync("npm", ["pack", "@trigger.dev/sdk@latest", "--silent"], { cwd: tmp, stdio: ["ignore", "pipe", "inherit"] });
const tgz = fs.readdirSync(tmp).find((n) => n.endsWith(".tgz"));
execFileSync("tar", ["-xzf", tgz, "package/docs"], { cwd: tmp });
const docsDir = path.join(tmp, "package", "docs");
const missingLocal = rows.filter((r) => r.local && !fs.existsSync(path.join(docsDir, `${r.pages[0].split("#")[0]}.mdx`)));
console.log(`(4) local parity: ${rows.filter((r) => r.local).length} rows marked L, ${missingLocal.length} first pages not bundled in the latest SDK`);
for (const r of missingLocal) console.log(`    NOT BUNDLED ${r.pages[0]} (row "${r.keys[0]}")`);
if (missingLocal.length) failed++;

const traps = fs.readFileSync(path.join(root, "references", "traps.md"), "utf8");
const names = ((/```deprecated\n([\s\S]*?)```/.exec(traps) || [])[1] || "").split("\n").map((x) => x.trim()).filter(Boolean);
const all = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.join(d, e.name))));
walk(docsDir);
const text = all.map((f) => fs.readFileSync(f, "utf8")).join("\n");
console.log(`(5) staleness (report only): old names from traps.md still present in the latest bundled docs`);
for (const n of names) {
  const c = text.split(n).length - 1;
  if (c) console.log(`    ${String(c).padStart(3)}  ${n}`);
}
// (6) machine prices: references/machine-prices.json vs the live pricing page
const prices = JSON.parse(fs.readFileSync(path.join(root, "references", "machine-prices.json"), "utf8"));
const html = await (await fetch("https://trigger.dev/pricing")).text();
const pricingText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const live = {};
for (const [k, label] of [["micro", "Micro"], ["small-1x", "Small 1x"], ["small-2x", "Small 2x"], ["medium-1x", "Medium 1x"], ["medium-2x", "Medium 2x"], ["large-1x", "Large 1x"], ["large-2x", "Large 2x"]]) {
  const m = new RegExp(`${label}(?: Default)? [\\d.]+ [\\d.]+ \\$(\\d\\.\\d+)`).exec(pricingText);
  live[k] = m ? Number(m[1]) : null;
}
const drift = Object.entries(prices.perSecond).filter(([k, v]) => live[k] !== v);
console.log(`(6) machine prices: ${drift.length} of ${Object.keys(prices.perSecond).length} differ from the live pricing page`);
for (const [k, v] of drift) console.log(`    ${k}: committed ${v}, live ${live[k]}`);
if (drift.length) failed++;
process.exit(failed ? 1 : 0);
