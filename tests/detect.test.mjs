// Fingerprint cases on the fixtures in tests/fixtures (versions come from package.json: "declared").
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect, brief } from "../scripts/lib/detect.mjs";

const fx = (n) => path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", n);
let fail = 0;
const check = (name, ok, extra = "") => {
  if (!ok) {
    console.log(`FAIL ${name} ${extra}`);
    fail++;
  }
};

const min = detect(fx("min"));
check("min: relevant", min.relevant);
check("min: root + project ref", min.roots[0]?.projectRef === "proj_fixturefixture" && min.roots[0].dirs[0] === "./src/trigger", JSON.stringify(min.roots));
check("min: versions", min.versions.sdk === "4.7.4" && min.versions.major === 4 && min.versions.aligned);
check("min: cloud target", min.target.kind === "cloud");
check("min: brief <= 700 chars", brief(min).length <= 700 && brief(min).startsWith("Trigger.dev project facts"));

const v3 = detect(fx("v3"));
check("v3: major 3 flagged", v3.versions.major === 3 && /v3 \(Cloud end of life\)/.test(brief(v3)), brief(v3));

const go = detect(fx("go"));
check("go: not relevant", !go.relevant && brief(go) === "");

const py = detect(fx("py"));
check("py: env-names signal, python, no root", py.relevant && py.signals.includes("env-names") && py.otherLanguages.includes("python") && py.roots.length === 0);
check("py: never prints a key value", !JSON.stringify(py).includes("tr_"));

const mono = detect(fx("mono"));
check("mono: two roots", mono.roots.length === 2, JSON.stringify(mono.roots.map((r) => r.dir)));
check("mono: pnpm + frontend next", mono.packageManager === "pnpm" && mono.frontend?.framework === "next" && mono.frontend.major === 16);
check("mono: MCP configPath line", /configPath=apps\//.test(brief(mono)), brief(mono));

process.env.TRIGGER_API_URL = "https://jobs.internal.example.com/";
const sh = detect(fx("min"));
check("self-host: from TRIGGER_API_URL", sh.target.kind === "self-host" && sh.target.url === "https://jobs.internal.example.com", JSON.stringify(sh.target));
check("self-host: brief names it", /self-hosted https:\/\/jobs\.internal\.example\.com/.test(brief(sh)));
delete process.env.TRIGGER_API_URL;

console.log(`${fail ? "FAILED" : "ok"}: detect cases, ${fail} failures`);
process.exitCode = fail ? 1 : 0;
