// Rule engine: rules are data (scripts/rules/rules.json); this file only knows matcher types.
// The engine LOCATES candidates; judgment-tier rules (detect J/L) have no matcher and are evaluated by an agent.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { SKIP_DIRS, CONFIG_RE, readText, readJson, git, majorOf, cmpVersion, exists } from "./util.mjs";
import { detect } from "./detect.mjs";
import { runBuiltins } from "./builtins.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RULES = path.join(HERE, "..", "rules", "rules.json");

const CODE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const SECRET_FILE_SKIP = /(^|\/)(\.env(\..*)?|.*lock(\.json|\.yaml|b)?|yarn\.lock|pnpm-lock\.yaml|package-lock\.json|bun\.lockb?)$/;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|mp[34]|mov|wasm|so|dylib|node|map|snap)$/i;
const MAX_FILE = 400_000;

let RULES_CACHE = new Map();
export function loadRules(file = DEFAULT_RULES) {
  if (!RULES_CACHE.has(file)) {
    const j = readJson(file);
    RULES_CACHE.set(file, Array.isArray(j) ? j : j?.rules || []);
  }
  return RULES_CACHE.get(file);
}

/* ---------- masking ---------- */

/** Replace comments (and optionally string contents) with spaces, keeping offsets and newlines. */
export function mask(text, { strings = false } = {}) {
  const out = text.split("");
  const n = text.length;
  let i = 0;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && text[j] !== "\n") j++;
      blank(i, j);
      i = j;
    } else if (c === "/" && d === "*") {
      let j = text.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      blank(i, j);
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && text[j] !== c) {
        if (text[j] === "\\") j++;
        else if (c !== "`" && text[j] === "\n") break;
        j++;
      }
      if (strings) blank(i + 1, Math.min(j, n));
      i = j + 1;
    } else i++;
  }
  return out.join("");
}

const lineOf = (text, idx) => {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
};

/** Index of the paren matching the "(" at `open` in `maskedAll` (strings and comments blanked), or -1. */
function matchParen(maskedAll, open) {
  let depth = 0;
  for (let i = open; i < maskedAll.length; i++) {
    const c = maskedAll[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

/* ---------- file kinds ---------- */

export function fileKinds(rel) {
  const base = path.basename(rel);
  const kinds = new Set();
  if (BINARY_EXT.test(rel)) return kinds;
  if (CODE_EXT.test(rel) && !rel.endsWith(".d.ts")) kinds.add("code");
  if (CONFIG_RE.test(base)) kinds.add("config");
  if (base === "package.json") kinds.add("package-json");
  if (/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(rel) || /(^|\/)(\.gitlab-ci\.yml|vercel\.json|netlify\.toml|Dockerfile|Makefile|fly\.toml)$/.test(rel)) kinds.add("workflow");
  if (!SECRET_FILE_SKIP.test(rel)) kinds.add("any-text");
  return kinds;
}

/* ---------- version gates ---------- */

const sdkCache = new Map();
export function sdkVersionFor(file, stop) {
  let d = path.dirname(file);
  const key0 = d;
  if (sdkCache.has(key0)) return sdkCache.get(key0);
  let found = null;
  for (let i = 0; i < 12 && !found; i++) {
    const inst = readJson(path.join(d, "node_modules", "@trigger.dev", "sdk", "package.json"));
    if (inst?.version) found = inst.version;
    else {
      const pj = readJson(path.join(d, "package.json"));
      const dec = pj && { ...pj.dependencies, ...pj.devDependencies }["@trigger.dev/sdk"];
      if (dec && /\d/.test(dec)) found = String(dec).replace(/^[^\d]*/, "");
    }
    if (found || (stop && d === stop) || path.dirname(d) === d) break;
    d = path.dirname(d);
  }
  sdkCache.set(key0, found);
  return found;
}

export function appliesWhen(expr, version) {
  if (!expr) return true;
  const m = /^sdk\s*(>=|<=|>|<|==)\s*(\d+(?:\.\d+){0,2})$/.exec(expr.trim());
  if (!m) return true;
  if (!version) return true; // unknown version: assume current (v3 is end of life)
  const want = m[2].split(".").concat(["0", "0"]).slice(0, 3).join(".");
  const have = (/\d+\.\d+\.\d+/.exec(version) || [])[0] || `${majorOf(version) ?? 4}.0.0`;
  const c = cmpVersion(have, want);
  if (c == null) return true;
  return { ">=": c >= 0, "<=": c <= 0, ">": c > 0, "<": c < 0, "==": c === 0 }[m[1]];
}

/* ---------- matchers ---------- */

const re = (src, flags = "") => new RegExp(src, flags);

function importsOf(masked) {
  const out = [];
  const R = /\bimport\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\*\s+as\s+([\w$]+)|\{([^}]*)\})?\s*from\s*(["'])([^"']+)\4|\bimport\s*\(\s*(["'])([^"']+)\6\s*\)|\brequire\s*\(\s*(["'])([^"']+)\8\s*\)|\bexport\s+(?:\*|\{[^}]*\})\s*from\s*(["'])([^"']+)\10/g;
  let m;
  while ((m = R.exec(masked))) {
    const mod = m[5] || m[7] || m[9] || m[11];
    const named = m[3] ? m[3].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "")).filter(Boolean) : [];
    if (m[1]) named.push("default");
    out.push({ mod, named, index: m.index, typeOnly: /^\s*import\s+type\b/.test(m[0]) });
  }
  return out;
}

/** Run one matcher on a file; returns [{line}] (max 3). `text` is raw, `ctx` carries cached masks. */
function runMatcher(m, ctx) {
  const hits = [];
  const push = (idx) => {
    if (hits.length < 3) hits.push({ line: lineOf(ctx.text, idx) });
  };
  const guardOk = () => (!m.require || re(m.require, "m").test(ctx.c)) && (!m.unless || !re(m.unless, "m").test(ctx.c));
  switch (m.type) {
    case "any":
      for (const sub of m.of) for (const h of runMatcher(sub, ctx)) if (hits.length < 3) hits.push(h);
      return hits;
    case "regex": {
      if (!guardOk()) return hits;
      const base = m.mask === "none" ? ctx.text : m.mask === "comments+strings" ? ctx.cs : ctx.c;
      const r = re(m.pattern, `g${(m.flags || "").replace("g", "")}`);
      let x;
      while ((x = r.exec(base)) && hits.length < 3) {
        if (m.notNear && re(m.notNear).test(base.slice(Math.max(0, x.index - 200), x.index + x[0].length + 200))) {
          if (x[0].length === 0) r.lastIndex++;
          continue;
        }
        push(x.index);
        if (x[0].length === 0) r.lastIndex++;
      }
      return hits;
    }
    case "call": {
      if (!guardOk()) return hits;
      const r = re(`(?:${m.callee})\\s*(?:<[^()]*?>)?\\s*\\(`, "g");
      let x;
      while ((x = r.exec(ctx.cs)) && hits.length < 3) {
        const open = x.index + x[0].length - 1;
        const close = matchParen(ctx.cs, open);
        if (close < 0) continue;
        const args = ctx.c.slice(open + 1, close);
        let hit = true;
        if (m.contains) {
          const spec = typeof m.contains === "string" ? { pattern: m.contains, min: 1 } : m.contains;
          const count = (args.match(re(spec.pattern, "g")) || []).length;
          hit = count >= (spec.min ?? 1);
          if (hit && m.containsAlso) hit = re(m.containsAlso).test(args);
        }
        if (hit && m.lacks && re(m.lacks).test(args)) hit = false;
        if (hit && m.argsMatch && !re(m.argsMatch).test(args)) hit = false;
        if (hit) push(x.index);
      }
      return hits;
    }
    case "import": {
      if (!guardOk()) return hits;
      for (const imp of importsOf(ctx.c)) {
        if (!re(m.from).test(imp.mod)) continue;
        if (m.named && !imp.named.some((n) => re(m.named).test(n))) continue;
        if (m.skipTypeOnly && imp.typeOnly) continue;
        push(imp.index);
        if (hits.length >= 3) break;
      }
      return hits;
    }
    case "handler": {
      if (!guardOk()) return hits;
      let contains = m.contains;
      if (m.localsFrom) {
        const names = [...ctx.c.matchAll(re(m.localsFrom, "g"))].map((x) => x[1]).filter(Boolean);
        if (!names.length) return hits;
        contains = contains.replace("{{LOCALS}}", `(?:${names.map((n) => n.replace(/\$/g, "\\$")).join("|")})`);
      }
      const r = re(`\\b(?:${m.name})\\s*(?::\\s*(?:async\\s*)?(?:function\\b[^(]*)?(?:\\([^)]*\\)|[\\w$]+)\\s*(?::\\s*[^={]+?)?\\s*(?:=>)?|\\([^)]*\\))\\s*\\{`, "g");
      let x;
      while ((x = r.exec(ctx.cs)) && hits.length < 3) {
        const open = x.index + x[0].length - 1;
        let depth = 0;
        let close = -1;
        for (let i = open; i < ctx.cs.length; i++) {
          if (ctx.cs[i] === "{") depth++;
          else if (ctx.cs[i] === "}" && --depth === 0) {
            close = i;
            break;
          }
        }
        if (close < 0) continue;
        const body = ctx.c.slice(open + 1, close);
        const mm = re(contains, "m").exec(body);
        if (mm) push(open + 1 + mm.index);
      }
      return hits;
    }
    case "json": {
      const j = ctx.json;
      if (!j) return hits;
      const sections = m.sections || ["dependencies", "devDependencies"];
      if (m.check === "dep-lt") {
        for (const s of sections) {
          const v = j[s]?.[m.dep];
          // a caret range in the same major resolves to the newest release, so only exact pins and tilde ranges can stay below the floor
          const caretOk = typeof v === "string" && /^\^/.test(v) && majorOf(v.replace(/^[^\d]*/, "")) === majorOf(m.version);
          if (v && !caretOk && /\d/.test(v) && cmpVersion(String(v).replace(/^[^\d]*/, ""), m.version) === -1) push(ctx.text.indexOf(`"${m.dep}"`) >= 0 ? ctx.text.indexOf(`"${m.dep}"`) : 0);
        }
      } else if (m.check === "dep-in") {
        for (const s of m.in || ["dependencies"]) {
          for (const dep of Object.keys(j[s] || {})) if (re(m.dep).test(dep)) push(ctx.text.indexOf(`"${dep}"`));
        }
      } else if (m.check === "dep-any") {
        for (const s of sections) for (const dep of Object.keys(j[s] || {})) if (re(m.dep).test(dep)) push(Math.max(0, ctx.text.indexOf(`"${dep}"`)));
      }
      return hits;
    }
    default:
      return hits;
  }
}

function ctxFor(file, text) {
  const c = mask(text);
  const kinds = fileKinds(file);
  let json = null;
  if (kinds.has("package-json")) {
    try {
      json = JSON.parse(text);
    } catch {}
  }
  return {
    text,
    c,
    get cs() {
      return (this._cs ??= mask(text, { strings: true }));
    },
    json,
  };
}

/* ---------- rule evaluation ---------- */

export function evalFile(file, text, rules, { rel = file, projectStop = null, tiers = ["hook"], target = null, frontend = null } = {}) {
  const kinds = fileKinds(rel);
  if (!kinds.size || text.length > MAX_FILE) return [];
  const ctx = ctxFor(rel, text);
  const hits = [];
  let version;
  for (const rule of rules) {
    if (!rule.match || !tiers.includes(rule.tier)) continue;
    if (rule.target && target && rule.target !== target) continue; // cloud-only or self-host-only rules
    if (rule.skip_paths && re(rule.skip_paths).test(rel)) continue; // e.g. task directories, tests
    if (rule.frontend === "next-app" && frontend && !(frontend.framework === "next" && frontend.router === "app")) continue; // Server Components exist only in the Next.js App Router
    const scope = rule.scope || "code";
    if (!kinds.has(scope)) continue;
    if (rule.prefilter ? !re(rule.prefilter).test(text) : scope === "code" && !/@trigger\.dev\//.test(text)) continue;
    if (rule.applies_when) {
      version ??= sdkVersionFor(file, projectStop);
      if (!appliesWhen(rule.applies_when, version)) continue;
    }
    for (const h of runMatcher(rule.match, ctx)) {
      hits.push({ rule: rule.id, severity: rule.severity, tier: rule.tier, file: rel, line: h.line, message: rule.message, fix: rule.fix, fix_mode: rule.fix_mode || "flag-only", doc: rule.doc, detect: rule.detect });
    }
  }
  return hits;
}

/* ---------- hook entry ---------- */

function dedupeFirst(sessionId, file, ruleId, env = process.env) {
  const data = env.CLAUDE_PLUGIN_DATA;
  if (!data) return true;
  const dir = path.join(data, "dedupe");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const key = crypto.createHash("sha1").update(`${sessionId}|${file}|${ruleId}`).digest("hex").slice(0, 24);
    fs.closeSync(fs.openSync(path.join(dir, key), "wx"));
    return true;
  } catch {
    return false;
  }
}

function formatHit(h) {
  return `\n- ${h.file}:${h.line} — ${h.message} → ${h.fix} (${h.doc})`;
}

// own = hits in the lines this edit wrote; older = hits in the rest of the file. Without a split (a Write, or an edit that cannot be located) all hits are own.
export function formatHits(own, { older = [], max = 5, cap = 1500 } = {}) {
  const all = own.length + older.length;
  let out = older.length
    ? `Trigger.dev tripwire (plugin trigger-dev), ${own.length ? `${own.length} hit${own.length === 1 ? "" : "s"} in this edit` : "none in this edit"}:`
    : `Trigger.dev tripwire (plugin trigger-dev), ${own.length} hit${own.length === 1 ? "" : "s"}:`;
  let shown = 0;
  let broke = false;
  const add = (list) => {
    for (const h of list) {
      const line = formatHit(h);
      if (shown >= max || out.length + line.length > cap) {
        broke = true;
        return;
      }
      out += line;
      shown++;
    }
  };
  add(own);
  if (older.length && !broke) {
    out += `\nAlready in this file before this edit (not from this change), ${older.length} hit${older.length === 1 ? "" : "s"}:`;
    add(older);
  }
  if (all > shown) out += `\n(+${all - shown} more)`;
  return out;
}

// Where each piece of new text sits in the file after the edit, as 1-based inclusive line ranges. null = cannot tell, treat everything as new.
function rangesOf(pieces, text) {
  const ranges = [];
  for (const piece of pieces) {
    if (typeof piece !== "string" || !piece.length) continue;
    let at = text.indexOf(piece);
    if (at < 0) return null;
    for (let n = 0; at >= 0; n++) {
      if (n >= 40) return null; // a tiny new_string that occurs everywhere says nothing about where the edit is
      const start = text.slice(0, at).split("\n").length;
      ranges.push([start, start + piece.split("\n").length - 1]);
      at = text.indexOf(piece, at + 1);
    }
  }
  return ranges.length ? ranges : null;
}

function editedRanges(payload, text) {
  const tool = payload?.tool_name;
  if (tool === "Write") return null;
  const pieces = tool === "MultiEdit" ? (payload?.tool_input?.edits || []).map((e) => e?.new_string) : [payload?.tool_input?.new_string];
  return rangesOf(pieces, text);
}

// Codex writes files with apply_patch; the patch text arrives in tool_input.command. Returns [{ file, added: string[] | null }]
// (added = the "+" blocks of an Update; null for an Add, where every line is new). Relative paths are relative to the session's cwd.
export function parsePatch(patch, cwd) {
  const out = [];
  let cur = null;
  let block = null;
  const flush = () => {
    if (block && cur?.added) cur.added.push(block.join("\n"));
    block = null;
  };
  for (const line of String(patch).split("\n")) {
    const m = /^\*\*\* (Add|Update) File: (.+)$/.exec(line) || /^\*\*\* Move to: (.+)$/.exec(line);
    if (m) {
      flush();
      const isMove = m.length === 2;
      const file = (isMove ? m[1] : m[2]).trim();
      if (isMove && cur) cur.file = path.resolve(cwd || process.cwd(), file);
      else out.push((cur = { file: path.resolve(cwd || process.cwd(), file), added: m[1] === "Add" ? null : [] }));
    } else if (/^\*\*\* /.test(line)) {
      flush();
      cur = null;
    } else if (cur?.added && line.startsWith("+")) {
      (block ||= []).push(line.slice(1));
    } else {
      flush();
    }
  }
  flush();
  return out;
}

function realOr(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

export function lintHook(payload, env = process.env) {
  const tool = payload?.tool_name;
  let targets;
  if (tool === "apply_patch") {
    const patch = payload?.tool_input?.command;
    if (typeof patch !== "string") return null;
    targets = parsePatch(patch, payload.cwd).map((t) => ({ file: t.file, pieces: t.added }));
  } else if (["Edit", "Write", "MultiEdit"].includes(tool)) {
    const file = payload?.tool_input?.file_path || payload?.tool_response?.filePath;
    if (!file) return null;
    targets = [{ file, pieces: undefined }];
  } else return null;
  const proj = env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const sid = payload.session_id || "s";
  const own = [];
  const older = [];
  for (const { file, pieces } of targets) {
    const text = readText(file, MAX_FILE);
    if (text == null) continue;
    let rel = path.relative(proj, file);
    if (rel.startsWith("..")) {
      const viaReal = path.relative(realOr(proj), realOr(file)); // /tmp vs /private/tmp on macOS
      rel = viaReal.startsWith("..") ? file : viaReal;
    }
    const found = evalFile(file, text, loadRules(), { rel, projectStop: proj, tiers: ["hook"] });
    const ranges = pieces === undefined ? editedRanges(payload, text) : pieces && rangesOf(pieces, text);
    const inEdit = (h) => !ranges || ranges.some(([a, b]) => h.line >= a - 1 && h.line <= b);
    own.push(...found.filter((h) => inEdit(h) && dedupeFirst(sid, file, h.rule, env)));
    older.push(...found.filter((h) => !inEdit(h) && dedupeFirst(sid, file, `${h.rule}:older`, env)));
  }
  if (!own.length && !older.length) return null;
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: formatHits(own, { older }) } };
}

/* ---------- CLI entry points ---------- */

export function lintFiles(paths, { all = false, rulesFile } = {}) {
  const rules = loadRules(rulesFile || DEFAULT_RULES);
  const tiers = all ? ["hook", "audit"] : ["hook"];
  const hits = [];
  let n = 0;
  for (const f of paths) {
    const text = readText(f, MAX_FILE);
    if (text == null) continue;
    n++;
    hits.push(...evalFile(path.resolve(f), text, rules, { rel: f, tiers }));
  }
  return { files: n, hits };
}

function listFiles(root) {
  const inGit = git(["rev-parse", "--show-toplevel"], root);
  if (inGit) {
    const ls = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], root);
    if (ls) return ls.split("\0").filter(Boolean).map((f) => path.join(root, f));
  }
  const out = [];
  const walk = (d, depth) => {
    if (depth > 8 || out.length > 20000) return;
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(d, e.name), depth + 1);
      } else if (e.isFile()) out.push(path.join(d, e.name));
    }
  };
  walk(root, 0);
  return out;
}

const DOMAINS = {
  tasks: /\b(?:task|schemaTask|schedules\.task)\s*\(/,
  schedules: /\bschedules\.(?:task|create)\b/,
  realtime: /\buseRealtime\w*|@trigger\.dev\/react-hooks|\bauth\.createPublicToken|\bruns\.subscribe/,
  chat: /\bchat\.agent\s*\(|@trigger\.dev\/sdk\/(?:ai|chat)/,
  webhooks: /webhooks?\b.*@trigger\.dev|@trigger\.dev\/sdk\/webhooks/,
};
const FOCUS_FAMILIES = { cost: ["COST", "QUE", "TSK"], chat: ["CHT"], realtime: ["RT"], deploy: ["DEP", "CFG", "MIG"], tasks: ["TSK", "QUE", "SCH", "MIG"], webhooks: ["WH"], config: ["CFG"] };

export function scan(root, { focus, tier, rulesFile } = {}) {
  root = path.resolve(root);
  const rules = loadRules(rulesFile || DEFAULT_RULES);
  const tiers = tier === "hook" ? ["hook"] : ["hook", "audit"];
  const families = focus && FOCUS_FAMILIES[focus];
  const inFocus = (r) => !families || families.includes(r.family || r.id.split("-")[0]);
  const active = rules.filter(inFocus);
  const fp = detect(root);
  const target = fp.target?.kind || null;
  const relevance = Object.fromEntries(Object.keys(DOMAINS).concat(["config", "ci"]).map((k) => [k, 0]));
  const hits = [];
  const codeFiles = [];
  const pkgs = [];
  let scanned = 0;
  for (const f of listFiles(root)) {
    const rel = path.relative(root, f);
    const kinds = fileKinds(rel);
    if (!kinds.size) continue;
    const text = readText(f, MAX_FILE);
    if (text == null) continue;
    scanned++;
    if (kinds.has("config")) relevance.config++;
    if (kinds.has("workflow") && /trigger/i.test(text)) relevance.ci++;
    if (kinds.has("code") && /@trigger\.dev\//.test(text)) {
      codeFiles.push({ rel, abs: f, text });
      for (const [d, r] of Object.entries(DOMAINS)) if (r.test(text)) relevance[d]++;
    }
    if (kinds.has("package-json")) pkgs.push({ rel, json: readJson(f) });
    hits.push(...evalFile(f, text, active, { rel, projectStop: root, tiers, target, frontend: fp.frontend }));
  }
  if (tiers.includes("audit")) hits.push(...runBuiltins(active, codeFiles, fp.roots, root));
  // cross-file builtin: version skew across package.json files, or any 3.x pin (MIG-08)
  const mig08 = rules.find((r) => r.id === "MIG-08");
  if (mig08 && inFocus(mig08) && tiers.includes("audit")) {
    const versions = new Map();
    for (const { rel, json } of pkgs) {
      for (const sec of ["dependencies", "devDependencies"]) for (const [k, v] of Object.entries(json?.[sec] || {})) {
        if ((k.startsWith("@trigger.dev/") || k === "trigger.dev") && /^[\^~]?\d/.test(v)) versions.set(`${rel}|${k}`, String(v).replace(/^[\^~]/, ""));
      }
    }
    const distinct = new Set(versions.values());
    const v3 = [...distinct].filter((v) => majorOf(v) === 3);
    if (distinct.size > 1 || v3.length) {
      hits.push({ rule: "MIG-08", severity: mig08.severity, tier: mig08.tier, file: pkgs.find((p) => p.json && Object.keys({ ...p.json.dependencies, ...p.json.devDependencies }).some((k) => k.startsWith("@trigger.dev/")))?.rel || "package.json", line: 1, message: distinct.size > 1 ? `@trigger.dev/* and trigger.dev versions differ (${[...distinct].join(", ")})` : `a 3.x version is pinned (${v3.join(", ")})`, fix: mig08.fix, fix_mode: "flag-only", doc: mig08.doc, detect: mig08.detect });
    }
  }
  return { root, filesScanned: scanned, target, relevance, hits };
}

export const _internal = { mask, importsOf, runMatcher, ctxFor, exists };
