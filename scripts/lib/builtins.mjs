// Cross-file rules that cannot be a per-file matcher. Each returns hits in the same shape as evalFile.
// Called by `scan` with every code file already read: files = [{ rel, abs, text }], roots = detect().roots.
import fs from "node:fs";
import path from "node:path";
import { mask } from "./lint.mjs";
import { readText, exists } from "./util.mjs";

const DEFINERS = String.raw`\b(?:schemaTask|task|schedules\.task|chat\.agent|chat\.customAgent)\s*\(\s*\{`;
const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;

function rule(rules, id) {
  return rules.find((r) => r.id === id);
}

function hit(r, rel, line, message) {
  return { rule: r.id, severity: r.severity, tier: r.tier, file: rel, line, message: message || r.message, fix: r.fix, fix_mode: r.fix_mode || "flag-only", doc: r.doc, detect: r.detect };
}

// Task ids are unique per Trigger.dev project, so a monorepo with several projects may reuse an id across roots.
export function duplicateTaskIds(rules, files, roots = [], base = "") {
  const r = rule(rules, "TSK-26");
  if (!r) return [];
  const seen = new Map();
  const owners = roots.map((r) => ({ dir: path.resolve(base, r.dir), key: r.projectRef || r.dir })).sort((a, b) => b.dir.length - a.dir.length);
  const ownerOf = (abs) => owners.find((o) => abs.startsWith(`${o.dir}${path.sep}`) || abs === o.dir)?.key || "";
  for (const f of files) {
    if (!/@trigger\.dev\//.test(f.text)) continue;
    const scope = owners.length > 1 ? ownerOf(f.abs) : "";
    const c = mask(f.text);
    for (const m of c.matchAll(new RegExp(`${DEFINERS}[^]{0,400}?\\bid\\s*:\\s*["'\`]([^"'\`$\\n]+)["'\`]`, "g"))) {
      const id = m[1];
      const skey = `${scope}\0${id}`;
      const list = seen.get(skey) || [];
      list.push({ rel: f.rel, line: lineOf(f.text, m.index) });
      seen.set(skey, list);
    }
  }
  const out = [];
  for (const [skey, locs] of seen) {
    const id = skey.slice(skey.indexOf("\0") + 1);
    if (new Set(locs.map((l) => `${l.rel}:${l.line}`)).size < 2) continue;
    for (const l of locs.slice(1)) out.push(hit(r, l.rel, l.line, `task id "${id}" is also declared at ${locs[0].rel}:${locs[0].line}`));
  }
  return out;
}

export function taskDirs(rules, files, roots, base) {
  const r = rule(rules, "TSK-27");
  if (!r) return [];
  const out = [];
  for (const root of roots) {
    const rootAbs = path.resolve(base, root.dir);
    const dirs = root.dirs.length ? root.dirs.map((d) => path.resolve(rootAbs, d)) : null;
    if (dirs) {
      for (const d of dirs) if (!exists(d)) out.push(hit(r, root.config, 1, `dirs lists "${path.relative(rootAbs, d)}", which does not exist`));
    }
    for (const f of files) {
      if (!f.abs.startsWith(`${rootAbs}${path.sep}`) && rootAbs !== base) continue;
      if (!/@trigger\.dev\//.test(f.text) || !new RegExp(DEFINERS).test(mask(f.text))) continue;
      const inside = dirs ? dirs.some((d) => f.abs.startsWith(`${d}${path.sep}`)) : f.abs.split(path.sep).includes("trigger");
      if (!inside) out.push(hit(r, f.rel, 1, dirs ? "defines a task outside the directories listed in trigger.config dirs, so it is not deployed" : "defines a task outside any directory named trigger (the default when dirs is omitted), so it is not deployed"));
    }
  }
  return out;
}

export function undeclaredQueues(rules, files) {
  const r = rule(rules, "QUE-03");
  if (!r) return [];
  const declared = new Set();
  const used = [];
  for (const f of files) {
    if (!/@trigger\.dev\//.test(f.text)) continue;
    const c = mask(f.text);
    for (const m of c.matchAll(/\bqueue\s*\(\s*\{[^}]*?\bname\s*:\s*["'`]([^"'`]+)["'`]/g)) declared.add(m[1]);
    for (const m of c.matchAll(/\bqueue\s*:\s*\{[^}]*?\bname\s*:\s*["'`]([^"'`]+)["'`]/g)) declared.add(m[1]);
    for (const m of c.matchAll(/\.(?:trigger|triggerAndWait|batchTrigger|batchTriggerAndWait)\s*\([^;]*?\bqueue\s*:\s*["'`]([^"'`]+)["'`]/g)) used.push({ name: m[1], rel: f.rel, line: lineOf(f.text, m.index) });
  }
  return used.filter((u) => !declared.has(u.name)).map((u) => hit(r, u.rel, u.line, `trigger options name queue "${u.name}", which no task or queue() declares (runs wait in PENDING_VERSION)`));
}

export function configChecks(rules, files, roots, base) {
  const out = [];
  const r01 = rule(rules, "CFG-01");
  const r03 = rule(rules, "CFG-03");
  const r08 = rule(rules, "CFG-08");
  for (const root of roots) {
    const rootAbs = path.resolve(base, root.dir);
    const cfg = readText(path.resolve(base, root.config)) || "";
    const own = files.filter((f) => f.abs.startsWith(`${rootAbs}${path.sep}`) || rootAbs === base);
    const hasBrowserExt = /\b(?:puppeteer|playwright|lightpanda)\s*\(/.test(cfg);
    const hasFfmpegExt = /\bffmpeg\s*\(/.test(cfg);
    const ffmpegExternal = /external\s*:\s*\[[^\]]*fluent-ffmpeg/.test(cfg);
    for (const f of own) {
      const c = mask(f.text);
      if (r01 && !hasBrowserExt && /\b(?:puppeteer|chromium|playwright|firefox|webkit)\s*\.\s*launch\s*\(/.test(c) && /\bfrom\s*["'](?:puppeteer|playwright|playwright-core|puppeteer-core)["']/.test(c)) {
        out.push(hit(r01, f.rel, lineOf(f.text, c.search(/\.\s*launch\s*\(/)), "launches a local browser, but trigger.config build.extensions has no puppeteer(), playwright() or lightpanda() extension"));
      }
      if (r03 && /\bfrom\s*["']fluent-ffmpeg["']|\bspawn\s*\(\s*["']ffmpeg["']/.test(c)) {
        if (!hasFfmpegExt) out.push(hit(r03, f.rel, lineOf(f.text, c.search(/fluent-ffmpeg|ffmpeg/)), "uses ffmpeg, but trigger.config has no ffmpeg() build extension"));
        else if (/fluent-ffmpeg/.test(c) && !ffmpegExternal) out.push(hit(r03, f.rel, lineOf(f.text, c.search(/fluent-ffmpeg/)), "uses fluent-ffmpeg, which must be listed in build.external"));
      }
    }
    if (r08) {
      const gi = readText(path.join(rootAbs, ".gitignore")) || readText(path.join(base, ".gitignore")) || "";
      if (!/^\/?\.trigger\/?$/m.test(gi)) out.push(hit(r08, ".gitignore", 1, ".trigger (the CLI's local build output) is not listed in .gitignore"));
      const ts = readText(path.join(rootAbs, "tsconfig.json"));
      if (ts) {
        const include = (/"include"\s*:\s*\[([^\]]*)\]/.exec(ts) || [])[1];
        const entries = include == null ? null : [...include.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        const covers = (e) => /^(?:\.|\.\/|\*\*\/\*(?:\.m?tsx?)?|\.\/\*\*\/\*(?:\.m?tsx?)?|\*\.m?ts|trigger\.config(?:\.\w+)?)$/.test(e);
        if (entries && !entries.some(covers)) out.push(hit(r08, path.relative(base, path.join(rootAbs, "tsconfig.json")), 1, "trigger.config.ts is not covered by the tsconfig include"));
      }
    }
  }
  return out;
}

export function runBuiltins(rules, files, roots, base) {
  return [
    ...duplicateTaskIds(rules, files, roots, base),
    ...taskDirs(rules, files, roots, base),
    ...undeclaredQueues(rules, files),
    ...configChecks(rules, files, roots, base),
  ];
}

export const _internal = { fs };
