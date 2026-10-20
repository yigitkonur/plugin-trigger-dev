#!/usr/bin/env node
// Turns two `claude plugin eval --json` files into the numbers quoted in docs/spikes.md.
// usage: node eval-compare.mjs <plugin-with-baseline.json> <official-skills.json> [evals-dir]
//   file 1: run in this repo with the default ablation (arms "with" = plugin, "without" = no plugin)
//   file 2: run with --ablation none in a scratch plugin that wraps the official skills (arm "with")
// A case's score is the weighted share of passed graders, averaged over its runs; `tool_used: Skill` graders
// (named skill-fired) are a plugin-fired indicator and are left out. Families come from the case's prompt.md tags.
import fs from "node:fs";
import path from "node:path";

const [plugFile, offFile, evalsDir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "evals")] = process.argv.slice(2);
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const plug = load(plugFile);
const off = load(offFile);
const EXCLUDED = new Set(["skill-fired"]);
const tagsOf = (name) => {
  const t = fs.readFileSync(path.join(evalsDir, name, "prompt.md"), "utf8").match(/^tags:\s*\[(.*)\]/m);
  return t ? t[1].split(",").map((x) => x.trim()) : [];
};
const caseScore = (runs) => {
  const per = (runs || []).map((r) => {
    const gs = (r.graders || []).filter((g) => !EXCLUDED.has(g.name));
    const w = gs.reduce((s, g) => s + (g.weight ?? 1), 0);
    return w ? gs.reduce((s, g) => s + (g.passed ? g.weight ?? 1 : 0), 0) / w : null;
  }).filter((x) => x != null);
  return per.length ? per.reduce((a, b) => a + b, 0) / per.length : null;
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const f = (x) => (x == null || Number.isNaN(x) ? "  -  " : x.toFixed(2));
const sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);

const rows = plug.cases.map((c) => {
  const o = off.cases.find((x) => x.name === c.name);
  const tags = tagsOf(c.name);
  return { name: c.name, tags, family: tags.find((t) => !["positive", "negative", "round2", "activation", "selfhost"].includes(t)) || (tags.includes("negative") ? "negative" : "other"), round2: tags.includes("round2"), negative: tags.includes("negative"), plugin: caseScore(c.arms.with), none: caseScore(c.arms.without), official: o ? caseScore(o.arms.with) : null };
});
rows.sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
console.log("case".padEnd(28), "family".padEnd(10), "plugin none  official  Δ-none  Δ-official");
for (const r of rows) console.log(r.name.padEnd(28), r.family.padEnd(10), f(r.plugin), f(r.none), f(r.official), "  ", sg(r.plugin - r.none).padEnd(7), sg(r.plugin - r.official));

const line = (label, set) => {
  if (!set.length) return;
  console.log(`${label.padEnd(30)} ${String(set.length).padStart(2)} cases | plugin ${f(mean(set.map((r) => r.plugin)))} none ${f(mean(set.map((r) => r.none)))} official ${f(mean(set.map((r) => r.official)))} | Δ vs none ${sg(mean(set.map((r) => r.plugin - r.none)))} | Δ vs official ${sg(mean(set.map((r) => r.plugin - r.official)))}`);
};
console.log("");
const core = rows.filter((r) => !r.round2);
line("original suite, all", core);
line("original suite, positive", core.filter((r) => !r.negative));
line("round-2 cases (newer APIs)", rows.filter((r) => r.round2));
line("everything, all", rows);
line("everything, positive", rows.filter((r) => !r.negative));
console.log("\nper family, positive cases only (Δ vs none | Δ vs official):");
for (const fam of [...new Set(rows.filter((r) => !r.negative).map((r) => r.family))]) {
  const s = rows.filter((r) => r.family === fam && !r.negative);
  console.log(" ", fam.padEnd(12), String(s.length).padStart(2), "cases |", sg(mean(s.map((r) => r.plugin - r.none))), "|", sg(mean(s.map((r) => r.plugin - r.official))));
}
const neg = rows.filter((r) => r.negative);
console.log("\nnegatives (must stay at 1.00 in the plugin arm):", neg.map((r) => f(r.plugin)).join(" "), neg.every((r) => r.plugin === 1) ? "OK" : "NOT ALL 1.00");
