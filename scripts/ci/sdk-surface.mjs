#!/usr/bin/env node
// The types of the installed SDK are the version-matched truth for API names. This reads them and flags what skills/ and references/ teach
// against them:
//   (1) a name the types mark @deprecated, on a line that does not say it is old (handleError, onStart, init:, cleanup:, ...);
//   (2) `tasks.foo`-style references whose member the types never declare (a misspelt or removed API).
// usage: node scripts/ci/sdk-surface.mjs [<node_modules/@trigger.dev dir> | --latest]   (exit 1 on a finding)
//   no argument: the sdk in the current project's node_modules; --latest: npm pack of the newest sdk, core, build, react-hooks.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let scope = process.argv[2];

if (scope === "--latest") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdp-surface-"));
  scope = path.join(tmp, "@trigger.dev");
  for (const p of ["sdk", "core", "build", "react-hooks"]) {
    const dir = fs.mkdtempSync(path.join(tmp, `${p}-`));
    execFileSync("npm", ["pack", `@trigger.dev/${p}@latest`, "--silent"], { cwd: dir, stdio: ["ignore", "pipe", "inherit"] });
    const tgz = fs.readdirSync(dir).find((n) => n.endsWith(".tgz"));
    execFileSync("tar", ["-xzf", tgz], { cwd: dir });
    fs.mkdirSync(scope, { recursive: true });
    fs.renameSync(path.join(dir, "package"), path.join(scope, p));
  }
} else if (!scope) {
  scope = path.join(process.cwd(), "node_modules", "@trigger.dev");
}
scope = fs.realpathSync(path.join(scope, "sdk")).replace(/\/sdk$/, "");

function walk(dir, ext, out = []) {
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, ext, out);
    else if (e.name.endsWith(ext)) out.push(f);
  }
  return out;
}

const declared = new Set();
const seen = new Map(); // name -> { total, deprecated, note }
const DECL = /^\s*(?:export\s+)?(?:declare\s+)?(?:(?:const|let|var|function|class|interface|type|enum|namespace)\s+)?(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*[:(<=]/;
for (const p of ["sdk", "core", "build", "react-hooks"]) {
  for (const file of walk(path.join(scope, p, "dist", "esm"), ".d.ts")) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const m = DECL.exec(line);
      if (!m) return;
      declared.add(m[1]);
      const e = seen.get(m[1]) || { total: 0, deprecated: 0, note: null };
      e.total++;
      for (let j = i - 1; j >= 0 && j >= i - 14; j--) {
        const t = lines[j].trim();
        if (!/^(\/\*\*|\*|\*\/)/.test(t)) break;
        const d = /@deprecated\s*(.*)$/.exec(t);
        if (d) {
          e.deprecated++;
          e.note = d[1].replace(/\*\/$/, "").replace(/^[\s,;:-]+/, "").trim() || "deprecated";
          break;
        }
      }
      seen.set(m[1], e);
    });
  }
}

// A name is deprecated when any declaration says so, except homonyms whose current meaning the plugin teaches:
// the function concurrencyLimit(), the additionalPackages extension and the task-level onSuccess/onFailure hooks are current; only the options of the same name (queue, build, trigger.config) are deprecated.
const HOMONYMS = new Set(["concurrencyLimit", "additionalPackages", "onSuccess", "onFailure", "onComplete"]);
const deprecated = new Map([...seen].filter(([n, e]) => e.deprecated > 0 && !HOMONYMS.has(n)).map(([n, e]) => [n, e.note]));
const SHORT = new Set(["init", "cleanup"].filter((n) => deprecated.has(n))); // plain words: only as an object key with a function value
const LONG = [...deprecated.keys()].filter((n) => /[A-Z]/.test(n) && n.length >= 5);
const OLD_WORDS = /deprecat|renam|removed|\bold\b|replac|instead|→|\bnot\b|never|\bwas\b|legacy|no longer|migrat|\bv3\b|v2|stale|prerelease|slated/i;
const HEADS = ["tasks", "schedules", "queues", "runs", "wait", "metadata", "streams", "batch", "auth", "idempotencyKeys", "logger", "retry", "envvars", "usage", "locals", "chat", "heartbeats", "tags", "prompts", "sessions", "timeout", "otel"];

const skip = new Set([path.join(root, "references", "traps.md"), path.join(root, "references", "rule-catalog.md")]);
const files = [...walk(path.join(root, "skills"), ".md"), ...walk(path.join(root, "references"), ".md")].filter((f) => !skip.has(f));
const findings = [];
for (const file of files) {
  const rel = path.relative(root, file);
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (OLD_WORDS.test(line)) return;
    for (const n of LONG) if (new RegExp(`(?<![\\w$.-])${n}(?![\\w$])`).test(line)) findings.push({ kind: "deprecated", rel, line: i + 1, name: n, note: deprecated.get(n), text: line.trim().slice(0, 140) });
    for (const n of SHORT) if (new RegExp(`(?<![\\w$./-])${n}\\s*:\\s*(?:async\\b|\\(|\\{)`).test(line) && !/^\s*\|/.test(line)) findings.push({ kind: "deprecated", rel, line: i + 1, name: n, note: deprecated.get(n), text: line.trim().slice(0, 140) });
    for (const m of line.matchAll(new RegExp(`(?<![\\w$./-])(${HEADS.join("|")})\\.([A-Za-z_$][\\w$]*)`, "g"))) {
      if (!declared.has(m[2])) findings.push({ kind: "undeclared", rel, line: i + 1, name: `${m[1]}.${m[2]}`, note: "member not declared in the installed types", text: line.trim().slice(0, 140) });
    }
  });
}

const ver = JSON.parse(fs.readFileSync(path.join(scope, "sdk", "package.json"), "utf8")).version;
console.log(`@trigger.dev/sdk ${ver}: ${declared.size} declared names, ${deprecated.size} @deprecated (${[...deprecated.keys()].slice(0, 12).join(", ")}${deprecated.size > 12 ? ", …" : ""}); scanned ${files.length} files`);
for (const f of findings) console.log(`${f.kind.toUpperCase()} ${f.rel}:${f.line} ${f.name}${f.note ? ` (${f.note})` : ""}\n    ${f.text}`);
console.log(`${findings.length} finding${findings.length === 1 ? "" : "s"}`);
process.exitCode = findings.length ? 1 : 0;
