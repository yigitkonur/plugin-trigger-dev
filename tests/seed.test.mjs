// Seeds a scratch repo with every rule's bad example (plus the cross-file cases) and checks that `scan` reports each rule at its file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRules, scan } from "../scripts/lib/lint.mjs";

const rules = loadRules();
const root = fs.mkdtempSync(path.join(os.tmpdir(), "tdp-seed-"));
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const where = {}; // rule id -> [relative file(s)]
for (const r of rules) {
  if (!r.match || !r.examples?.bad?.length) continue;
  r.examples.bad.forEach((code, i) => {
    const sfx = r.examples.bad.length > 1 ? `-${i + 1}` : "";
    const rel = { code: `src/${r.id}${sfx}/example.ts`, config: `cfg/${r.id}${sfx}/trigger.config.ts`, "package-json": `pkg/${r.id}${sfx}/package.json`, workflow: `.github/workflows/${r.id}${sfx}.yml`, "any-text": `notes/${r.id}${sfx}.txt` }[r.scope || "code"];
    write(rel, code);
    (where[r.id] ||= []).push(rel);
  });
}
// cross-file cases
write("src/dup/a.ts", 'import { task } from "@trigger.dev/sdk";\nexport const a = task({ id: "same-id", run: async () => {} });\n');
write("src/dup/b.ts", 'import { task } from "@trigger.dev/sdk";\nexport const b = task({ id: "same-id", run: async () => {} });\n');
write("src/queue/q.ts", 'import { tasks } from "@trigger.dev/sdk";\nawait tasks.trigger("x", {}, { queue: "never-declared" });\n');
write("src/browser/b.ts", 'import { task } from "@trigger.dev/sdk";\nimport puppeteer from "puppeteer";\nexport const s = task({ id: "shot", run: async () => { const b = await puppeteer.launch(); } });\n');
write("package.json", '{ "name": "seed", "dependencies": { "@trigger.dev/sdk": "4.7.4" } }\n');
write("trigger.config.ts", 'import { defineConfig } from "@trigger.dev/sdk";\nexport default defineConfig({ project: "proj_seedseedseedseeds", dirs: ["./nope"], maxDuration: 300 });\n');
write("pkg/skew/package.json", '{ "dependencies": { "@trigger.dev/sdk": "4.7.4", "@trigger.dev/build": "4.6.0" } }\n');

const out = scan(root, { tier: "all" });
process.env.TRIGGER_API_URL = "https://jobs.internal.example.com";
const outSelf = scan(root, { tier: "all" });
delete process.env.TRIGGER_API_URL;
const byRule = Object.fromEntries(rules.map((r) => [r.id, r]));
const found = new Set(out.hits.map((h) => `${h.rule}|${h.file}`));
const foundSelf = new Set(outSelf.hits.map((h) => `${h.rule}|${h.file}`));
let fail = 0;
for (const [id, rels] of Object.entries(where)) {
  for (const rel of rels) {
    const t = byRule[id].target;
    const expectCloud = t !== "self-host";
    const expectSelf = t !== "cloud";
    if (expectCloud && !found.has(`${id}|${rel}`)) { console.log(`FAIL ${id}: no hit at ${rel} (cloud target)`); fail++; }
    if (!expectCloud && found.has(`${id}|${rel}`)) { console.log(`FAIL ${id}: self-host-only rule fired on a Cloud target`); fail++; }
    if (expectSelf && !foundSelf.has(`${id}|${rel}`)) { console.log(`FAIL ${id}: no hit at ${rel} (self-host target)`); fail++; }
    if (!expectSelf && foundSelf.has(`${id}|${rel}`)) { console.log(`FAIL ${id}: cloud-only rule fired on a self-hosted target`); fail++; }
  }
}
for (const [id, needle] of [["TSK-26", "src/dup/b.ts"], ["QUE-03", "src/queue/q.ts"], ["CFG-01", "src/browser/b.ts"], ["TSK-27", "trigger.config.ts"], ["MIG-08", "package.json"]]) {
  if (!out.hits.some((h) => h.rule === id && h.file.endsWith(needle.split("/").pop()))) {
    console.log(`FAIL ${id}: cross-file case not reported (${needle})`);
    fail++;
  }
}
const total = Object.values(where).flat().length;
console.log(`${fail ? "FAILED" : "ok"}: ${total} seeded bad examples + 5 cross-file cases, ${out.hits.length} hits on ${out.filesScanned} files, ${fail} failures`);
fs.rmSync(root, { recursive: true, force: true });
process.exitCode = fail ? 1 : 0;
