// docs <topic|path>: resolve a topic to doc pages. Never prints page content; the agent reads the file or URL it is given.
// Lookup tiers: 1 local pinned copy (node_modules/@trigger.dev/sdk/docs), 2 MCP search_docs (agent side), 3 web .md.
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
const BETA_PAGE = /^webhooks\//;

function score(row, words, whole) {
  let s = 0;
  for (const p of row.pages) {
    const base = p.split("#")[0];
    if (base === whole || base.split("/").pop() === whole) s += 80;
  }
  for (const k of row.keys) {
    if (k === whole) s += 100;
    else if (whole.includes(k) || k.includes(whole)) s += 30;
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
  const ranked = rows.map((r) => [score(r, words, whole), r]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 3);
  const matches = ranked.map(([, r]) => {
    let gate = null;
    if (r.since && sdk && cmpVersion(sdk, r.since) === -1) gate = `needs SDK >= ${r.since} (installed ${sdk}); update with: npx trigger.dev@latest update`;
    else if (r.since && !sdk) gate = `needs SDK >= ${r.since}`;
    const betaPages = r.pages.filter((p) => BETA_PAGE.test(p));
    if (betaPages.length) gate = `${gate ? `${gate}; ` : ""}${betaPages.join(", ")} ${betaPages.length > 1 ? "are" : "is"} private beta (request access: https://trigger.dev/webhooks-beta); keep a non-beta fallback`;
    if (r.flags.includes("cloud") && fp.target?.kind === "self-host") gate = `${gate ? `${gate}; ` : ""}cloud-only; does not apply to a self-hosted instance`;
    return { key: r.keys[0], pages: r.pages.map(page), since: r.since, flags: r.flags, gate, note: r.note };
  });
  return { query: q, sdk, pinnedDocs: fp.pinnedDocs, matches, fallback: matches.length ? null : "no index row; use MCP search_docs, or read https://trigger.dev/docs/llms.txt to find a path" };
}
