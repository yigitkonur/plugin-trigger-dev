// docs <topic|path>: resolve a topic to doc pages. Never prints page content; the agent reads the file or URL it is given.
// Lookup tiers: 1 local pinned copy (node_modules/@trigger.dev/sdk/docs), 2 MCP search_docs (agent side), 3 web .md.
// A query that is a single identifier (catchError, wait.forToken) is also looked up as a symbol: in the pinned docs (where it is explained)
// and in the installed SDK's type declarations (whether it exists, and whether the types mark it @deprecated).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readText, exists, cmpVersion } from "./util.mjs";
import { detect } from "./detect.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = "https://trigger.dev/docs/";

export function parseIndex(text) {
  const rows = [];
  for (const line of (text || "").split("\n")) {
    if (!line.startsWith("|") || /^\|\s*-/.test(line) || /^\|\s*key\b/i.test(line)) continue;
    const c = line.split("|").slice(1, -1).map((s) => s.trim());
    if (c.length < 2 || !c[0] || !c[1]) continue;
    rows.push({
      keys: c[0].split(";").map((k) => k.trim().toLowerCase()).filter(Boolean),
      pages: c[1].split(",").map((p) => p.trim().replace(/^`|`$/g, "")).filter(Boolean),
      local: /\bL\b/.test(c[2] || ""),
      since: (c[3] || "").trim() || null,
      flags: (c[4] || "").split(/[ ,]+/).filter(Boolean),
      note: c[5] || "",
    });
  }
  return rows;
}

const STOP = new Set(["sdk", "trigger", "dev", "triggerdev", "task", "tasks", "how", "to", "the", "a", "in", "with", "use", "using", "for", "and", "of", "do", "i", "my"]);
// No docs page is beta as of SDK 4.8.0 (webhooks went generally available). A future beta page goes in this pattern.
const BETA_PAGE = /^$^/;

const IDENT = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function walk(dir, ext, out = [], depth = 0) {
  if (depth > 8 || out.length > 4000) return out;
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.name === "node_modules") continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, ext, out, depth + 1);
    else if (e.name.endsWith(ext)) out.push(f);
  }
  return out;
}

// Pages of the pinned docs that mention the symbol: headings first, then prose, then code; at most two per page, five in all.
function docHits(name, docsDir) {
  const out = [];
  const last = name.split(".").pop();
  const hits = [];
  let usedLast = false;
  for (const pattern of name === last ? [name] : [name, last]) {
    usedLast = pattern !== name;
    const re = new RegExp(`(?<![\\w$])${esc(pattern)}(?![\\w$])`);
    for (const file of walk(docsDir, ".mdx")) {
      if (/(^|\/)changelog\.mdx$/.test(file)) continue;
      const text = readText(file, 400_000);
      if (text == null) continue;
      let fence = false;
      let section = "";
      text.split("\n").forEach((line, i) => {
        if (/^\s*```/.test(line)) fence = !fence;
        const h = !fence && /^#{1,5}\s+(.*)$/.exec(line);
        if (h) section = h[1].replace(/`/g, "").trim();
        if (!re.test(line)) return;
        const rel = path.relative(docsDir, file).replace(/\.mdx$/, "");
        const rank = path.basename(rel).toLowerCase() === pattern.toLowerCase() ? -1 : h ? 0 : fence ? 2 : 1;
        hits.push({ rank, depth: rel.split("/").length, rel, line: i + 1, section, text: line.trim().slice(0, 140) });
      });
    }
    if (hits.length) break;
  }
  hits.sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.rel.localeCompare(b.rel) || a.line - b.line);
  out.lastSegmentOnly = usedLast && hits.length > 0;
  const perPage = {};
  for (const h of hits) {
    perPage[h.rel] = (perPage[h.rel] || 0) + 1;
    if (perPage[h.rel] > 2) continue;
    out.push({ file: `${h.rel}.mdx`, line: h.line, section: h.section || null, text: h.text, web: `${WEB}${h.rel}` });
    if (out.length >= 5) break;
  }
  return out;
}

// Declarations of the symbol in the installed packages' .d.ts files, with the @deprecated note from the JSDoc block above each.
function typeHits(name, sdkDir) {
  const parts = name.split(".");
  const last = parts.pop();
  const head = parts.length ? esc(parts[0]) : null;
  const headDecl = head && new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:const|let|var|function|class|interface|type|enum|namespace)\\s+${head}(?![\\w$])`, "m");
  const n = esc(last);
  const decl = new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:(?:const|let|var|function|class|interface|type|enum|namespace)\\s+${n}(?![\\w$])|(?:readonly\\s+)?${n}\\??\\s*[:(<])`);
  const scope = path.join(sdkDir, "..");
  const pkgs = ["sdk", "core", "build", "react-hooks"].map((p) => path.join(scope, p, "dist", "esm"));
  const hits = [];
  for (const root of pkgs) {
    for (const file of walk(root, ".d.ts")) {
      const text = readText(file, 800_000);
      if (text == null || !text.includes(last) || (headDecl && !headDecl.test(text))) continue;
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!decl.test(line)) return;
        let deprecated = null;
        for (let j = i - 1; j >= 0 && j >= i - 14; j--) {
          const t = lines[j].trim();
          if (!/^(\/\*\*|\*|\*\/)/.test(t)) break;
          const m = /@deprecated\s*(.*)$/.exec(t);
          if (m) {
            deprecated = (m[1] || "deprecated").replace(/\*\/$/, "").replace(/^[\s,;:-]+/, "").trim() || "deprecated";
            break;
          }
        }
        hits.push({ file: path.relative(scope, file), line: i + 1, decl: line.trim().slice(0, 120), deprecated });
      });
    }
  }
  hits.sort((a, b) => Number(!!b.deprecated) - Number(!!a.deprecated) || a.file.localeCompare(b.file) || a.line - b.line);
  return hits.slice(0, 6);
}

function symbolFacts(name, fp, docsDir) {
  const sdkDir = docsDir ? path.dirname(docsDir) : path.resolve(fp.projectDir, "node_modules", "@trigger.dev", "sdk");
  let real = null;
  try {
    real = fs.realpathSync(sdkDir);
  } catch {}
  if (!real) return { name, declared: null, note: "no installed @trigger.dev/sdk to check against; resolve it with MCP search_docs or the web page before using it" };
  const types = typeHits(name, real);
  const pages = docsDir ? docHits(name, docsDir) : [];
  const deprecated = types.filter((t) => t.deprecated).map((t) => `${t.decl.replace(/[;,]$/, "")} (${t.file}:${t.line}): ${t.deprecated}`);
  const out = { name, declared: types.length > 0, deprecated, types, docs: pages };
  if (pages.lastSegmentOnly) out.note = `no pinned page mentions "${name}" as a whole; the docs hits are for "${name.split(".").pop()}" alone`;
  if (!types.length && !pages.length) out.note = "not declared in the installed @trigger.dev types and not in the pinned docs (your own code is not searched): check the spelling, or resolve it with MCP search_docs before using it";
  return out;
}

function score(row, words, whole, strictOnly = false) {
  let s = 0;
  for (const p of row.pages) {
    const base = p.split("#")[0];
    if (base === whole || base.split("/").pop() === whole) s += 80;
  }
  for (const k of row.keys) {
    if (k === whole) s += 100;
    else if (k.length >= 5 && whole.length >= 5 && (whole.includes(k) || k.includes(whole))) s += 30;
    if (strictOnly) continue;
    const kw = k.split(/[\s/_-]+/);
    for (const w of words) if (kw.includes(w)) s += 10;
    for (const w of words) if (w.length > 3 && k.includes(w)) s += 3;
  }
  return s;
}

export function docs(topic, projDir, { indexFile } = {}) {
  const q = String(topic || "").trim();
  if (!q) return { error: "give a topic or a doc path, e.g. `docs wait-for-token` or `docs 'parallel waits'`" };
  const fp = detect(projDir);
  const docsDir = fp.pinnedDocs ? path.resolve(fp.projectDir, fp.pinnedDocs) : null;
  const sdk = fp.versions?.sdk || null;
  const page = (p) => {
    const clean = p.replace(/^\/+|\.mdx?$/g, "").replace(/^docs\//, "");
    const [base, anchor] = clean.split("#");
    const localFile = docsDir && exists(path.join(docsDir, `${base}.mdx`)) ? path.join(docsDir, `${base}.mdx`) : null;
    return { path: base, anchor: anchor || null, beta: BETA_PAGE.test(base), local: localFile, web: `${WEB}${base}${anchor ? `#${anchor}` : ""}`, webMd: `${WEB}${base}.md` };
  };
  if (/[\/]/.test(q) && !/\s/.test(q)) return { query: q, sdk, matches: [{ key: q, pages: [page(q)], since: null, flags: [], gate: null, note: "" }] };
  const rows = parseIndex(readText(indexFile || path.join(ROOT, "references", "link-index.md"), 600_000));
  const whole = q.toLowerCase();
  const words = whole.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
  const symbol = q.length <= 120 && IDENT.test(q) && !/^[a-z]+$/.test(q) ? symbolFacts(q, fp, docsDir) : null; // plain lower-case words are topics ("webhooks"), not symbols
  const ranked = rows.map((r) => [score(r, words, whole, !!symbol), r]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 3);
  const matches = ranked.map(([, r]) => {
    let gate = null;
    if (r.since && sdk && cmpVersion(sdk, r.since) === -1) gate = `needs SDK >= ${r.since} (installed ${sdk}); update with: npx trigger.dev@latest update`;
    else if (r.since && !sdk) gate = `needs SDK >= ${r.since}`;
    const betaPages = r.pages.filter((p) => BETA_PAGE.test(p));
    if (betaPages.length) gate = `${gate ? `${gate}; ` : ""}${betaPages.join(", ")} ${betaPages.length > 1 ? "are" : "is"} in beta; keep a stable fallback`;
    if (r.flags.includes("cloud") && fp.target?.kind === "self-host") gate = `${gate ? `${gate}; ` : ""}cloud-only; does not apply to a self-hosted instance`;
    return { key: r.keys[0], pages: r.pages.slice(0, 4).map(page), morePages: Math.max(0, r.pages.length - 4), since: r.since, flags: r.flags, gate, note: r.note };
  });
  const res = { query: q, sdk, pinnedDocs: fp.pinnedDocs, matches, fallback: matches.length || (symbol && (symbol.docs?.length || symbol.types?.length)) ? null : "no index row; use MCP search_docs, or read https://trigger.dev/docs/llms.txt to find a path" };
  if (symbol) res.symbol = symbol;
  return res;
}
