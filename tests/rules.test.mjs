// Every rule with a matcher must hit its bad examples and stay silent on its good examples.
// usage: node tests/rules.test.mjs [rules.json]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules, evalFile, DEFAULT_RULES } from "../scripts/lib/lint.mjs";

const rulesFile = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_RULES;
const rules = loadRules(rulesFile);
const FILE = { code: "src/trigger/example.ts", config: "trigger.config.ts", "package-json": "package.json", workflow: ".github/workflows/ci.yml", "any-text": "notes.txt" };
let fail = 0;
let checked = 0;
for (const r of rules) {
  if (!r.match) continue;
  const rel = FILE[r.scope || "code"];
  const run = (code) => evalFile(`/tmp/tdp-rule-test/${rel}`, code, [r], { rel, tiers: [r.tier] }).filter((h) => h.rule === r.id);
  if (!r.examples?.bad?.length || !r.examples?.good?.length) {
    console.log(`FAIL ${r.id}: needs at least one bad and one good example`);
    fail++;
    continue;
  }
  r.examples.bad.forEach((code, i) => {
    checked++;
    if (!run(code).length) {
      console.log(`FAIL ${r.id}: bad example #${i + 1} did not hit`);
      fail++;
    }
  });
  r.examples.good.forEach((code, i) => {
    checked++;
    const h = run(code);
    if (h.length) {
      console.log(`FAIL ${r.id}: good example #${i + 1} hit at line ${h[0].line}`);
      fail++;
    }
  });
}
console.log(`${fail ? "FAILED" : "ok"}: ${rules.filter((r) => r.match).length} matcher rules, ${checked} examples, ${fail} failures`);
process.exitCode = fail ? 1 : 0;
