#!/usr/bin/env node
// Renders scripts/rules/rules.json into references/rule-catalog.md (read by the audit command and by humans).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(fs.readFileSync(path.join(here, "rules.json"), "utf8")).rules;
const FAMILY = {
  MIG: "stale APIs and migration", TSK: "task authoring and reliability", QUE: "queues and concurrency", SCH: "schedules",
  RT: "realtime, frontend, auth", CHT: "chat agents", WH: "webhooks (hosted endpoints need SDK 4.8.0, except WH-06)", CFG: "config and build",
  DEP: "deploy, CI, environments", COST: "cost (evidence-driven)", OPS: "live operations (--live)",
};
const SEV = { error: "E", warning: "W", info: "I" };
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
let out = `# Rule catalog

Generated from \`scripts/rules/rules.json\` by \`node scripts/rules/render-catalog.mjs\`. Do not edit by hand.

Severity: **E** error (broken or unsafe) · **W** warning (likely wrong or costly) · **I** info.
Detection: **S** script · **S+J** script locates, an agent confirms · **J** judgment · **L** live data.
Tier: **hook** = checked after every edit (precision ≥ 95%); **audit** = checked by \`/trigger-dev:audit\`.
\`auto\` = the audit may apply the fix; everything else is flag-only. ${rules.length} rules, ${rules.filter((r) => r.tier === "hook").length} hook tier.
`;
for (const fam of Object.keys(FAMILY)) {
  const rs = rules.filter((r) => r.family === fam);
  if (!rs.length) continue;
  out += `\n## ${fam}: ${FAMILY[fam]}\n\n| ID | Sev | Det | Tier | Rule | Fix | Doc |\n|---|---|---|---|---|---|---|\n`;
  for (const r of rs) out += `| ${r.id} | ${SEV[r.severity] || r.severity} | ${r.detect} | ${r.tier}${r.fix_mode === "auto" ? ", auto" : ""} | ${esc(r.message)} | ${esc(r.fix)} | ${esc(r.doc)} |\n`;
}
fs.writeFileSync(path.join(here, "..", "..", "references", "rule-catalog.md"), out);
console.log(`rule-catalog.md: ${rules.length} rules`);
