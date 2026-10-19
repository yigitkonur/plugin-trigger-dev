#!/usr/bin/env node
// Merges scripts/rules/src/*.mjs (exports ending in "Rules") into scripts/rules/rules.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, "src");
const all = [];
for (const f of fs.readdirSync(srcDir).filter((n) => n.endsWith(".mjs") || n.endsWith(".json")).sort()) {
  if (f.endsWith(".json")) {
    const j = JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8"));
    all.push(...(Array.isArray(j) ? j : j.rules));
    continue;
  }
  const mod = await import(pathToFileURL(path.join(srcDir, f)));
  for (const [k, v] of Object.entries(mod)) if (k.endsWith("Rules") && Array.isArray(v)) all.push(...v);
}
const ids = new Set();
for (const r of all) {
  if (ids.has(r.id)) throw new Error(`duplicate rule id ${r.id}`);
  ids.add(r.id);
  for (const k of ["id", "family", "severity", "tier", "detect", "message", "fix", "doc"]) if (!r[k]) throw new Error(`${r.id}: missing ${k}`);
  if (!/^https:\/\/trigger\.dev\/docs\//.test(r.doc)) throw new Error(`${r.id}: doc must be a trigger.dev/docs URL`);
}
all.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
fs.writeFileSync(path.join(here, "rules.json"), `${JSON.stringify({ schema_version: 1, rules: all }, null, 1)}\n`);
console.log(`rules.json: ${all.length} rules (${all.filter((r) => r.tier === "hook").length} hook tier)`);
