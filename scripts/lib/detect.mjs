// Project fingerprint: what Trigger.dev setup (if any) lives under the project dir.
// Facts only. Env files are read for variable NAMES (and the value of TRIGGER_API_URL, which is a URL, not a secret).
import fs from "node:fs";
import path from "node:path";
import { CONFIG_RE, SKIP_DIRS, readText, readJson, exists, isDir, git, majorOf, home, writeMarker, pruneData, steering } from "./util.mjs";

const SIGNAL_ENV = /^\s*(?:export\s+)?(TRIGGER_SECRET_KEY|TRIGGER_API_URL|TRIGGER_PROJECT_REF|TRIGGER_ACCESS_TOKEN)\s*=(.*)$/;
const DEFAULT_API = /^https:\/\/(api|cloud)\.trigger\.dev\/?$/;
const OFFICIAL_SKILLS = [
  "trigger-tasks", "trigger-setup", "trigger-realtime", "trigger-cost-savings", "trigger-chat-agent-advanced",
  "trigger-authoring-chat-agent", "trigger-authoring-tasks", "trigger-realtime-and-frontend", "trigger-getting-started",
];

const rel = (base, p) => path.relative(base, p) || ".";

function walkForConfigs(base, maxDepth = 4, cap = 20000) {
  const out = [];
  let seen = 0;
  const walk = (dir, depth) => {
    if (depth > maxDepth || seen > cap) return;
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      seen++;
      if (e.isFile() && CONFIG_RE.test(e.name)) out.push(path.join(dir, e.name));
      else if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(base, 0);
  return out;
}

export function findConfigs(base, gitRoot) {
  const found = new Set();
  // 1. config in base and its ancestors up to the git root
  let d = base;
  for (let i = 0; i < 8; i++) {
    try {
      for (const n of fs.readdirSync(d)) if (CONFIG_RE.test(n)) found.add(path.join(d, n));
    } catch {}
    if (!gitRoot || d === gitRoot || path.dirname(d) === d) break;
    d = path.dirname(d);
  }
  // 2. tracked files anywhere below (monorepos), else a bounded walk
  if (gitRoot) {
    const ls = git(["ls-files", "-z", "--", "*trigger.config.*"], base);
    if (ls != null) {
      for (const f of ls.split("\0")) if (f && CONFIG_RE.test(path.basename(f))) found.add(path.resolve(base, f));
    }
  }
  if (found.size === 0) for (const f of walkForConfigs(base)) found.add(f);
  return [...found]
    .filter((f) => !path.relative(base, f).startsWith(".."))
    .sort((a, b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b));
}

function nearestUp(start, stop, rel2) {
  let d = start;
  for (let i = 0; i < 12; i++) {
    const p = path.join(d, rel2);
    if (exists(p)) return p;
    if (d === stop || path.dirname(d) === d) break;
    d = path.dirname(d);
  }
  return null;
}

function parseConfig(file) {
  const t = readText(file) || "";
  const projectRef = (/project\s*:\s*["'`](proj_[A-Za-z0-9]+)["'`]/.exec(t) || [])[1] || null;
  const dirsM = /dirs\s*:\s*\[([^\]]*)\]/.exec(t);
  const dirs = dirsM ? [...dirsM[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]) : [];
  const extensions = [
    ...new Set([...t.matchAll(/from\s+["']@trigger\.dev\/(?:build\/extensions\/([\w/-]+)|(python)\/extension)["']/g)].map((m) => m[1] || m[2])),
  ];
  const defineFrom = (/import\s*\{[^}]*\bdefineConfig\b[^}]*\}\s*from\s*["']([^"']+)["']/.exec(t) || [])[1] || null;
  return {
    projectRef,
    dirs,
    extensions,
    runtime: (/runtime\s*:\s*["']([\w.-]+)["']/.exec(t) || [])[1] || null,
    hasMaxDuration: /maxDuration\s*:/.test(t),
    defineConfigFrom: defineFrom,
  };
}

function depVersions(pkg) {
  const all = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}), ...(pkg?.peerDependencies || {}) };
  return all;
}

function installedVersion(startDir, stop, name) {
  const p = nearestUp(startDir, stop, path.join("node_modules", ...name.split("/"), "package.json"));
  const j = p ? readJson(p) : null;
  return j?.version ? { version: j.version, dir: path.dirname(p) } : null;
}

function workspacePackages(base, gitRoot) {
  const out = [];
  const rootPkg = readJson(path.join(base, "package.json"));
  if (rootPkg) out.push({ dir: base, pkg: rootPkg });
  const globs = [];
  const pnpm = readText(path.join(base, "pnpm-workspace.yaml"));
  if (pnpm) for (const m of pnpm.matchAll(/^\s*-\s*["']?([^"'\n#]+?)["']?\s*$/gm)) globs.push(m[1]);
  const ws = rootPkg?.workspaces;
  if (Array.isArray(ws)) globs.push(...ws);
  else if (Array.isArray(ws?.packages)) globs.push(...ws.packages);
  for (const g of globs) {
    const parent = g.replace(/\/\*+.*$/, "").replace(/^\.\//, "");
    if (!parent || parent.includes("*") || parent.startsWith("!")) continue;
    const dir = path.join(base, parent);
    let ents = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
      const pj = readJson(path.join(dir, e.name, "package.json"));
      if (pj) out.push({ dir: path.join(dir, e.name), pkg: pj });
      if (out.length > 80) return out;
    }
  }
  // polyglot subpackage
  const tp = readJson(path.join(base, "trigger", "package.json"));
  if (tp && !out.some((o) => o.dir === path.join(base, "trigger"))) out.push({ dir: path.join(base, "trigger"), pkg: tp });
  return out;
}

function frontendOf(pkgs, base) {
  const order = [
    ["next", "next"], ["@remix-run/react", "remix"], ["react-router", "react-router"], ["nuxt", "nuxt"],
    ["@sveltejs/kit", "sveltekit"], ["astro", "astro"], ["@tanstack/react-start", "tanstack-start"],
  ];
  for (const { dir, pkg } of pkgs) {
    const deps = depVersions(pkg);
    for (const [dep, name] of order) {
      if (deps[dep]) {
        const router = name === "next" ? (isDir(path.join(dir, "app")) || isDir(path.join(dir, "src", "app")) ? "app" : isDir(path.join(dir, "pages")) || isDir(path.join(dir, "src", "pages")) ? "pages" : null) : null;
        return { framework: name, major: majorOf(deps[dep]), router, dir: rel(base, dir) };
      }
    }
  }
  for (const { dir, pkg } of pkgs) {
    const deps = depVersions(pkg);
    if (deps.vite && deps.react) return { framework: "vite-react", major: majorOf(deps.react), router: null, dir: rel(base, dir) };
    if (deps.react) return { framework: "react", major: majorOf(deps.react), router: null, dir: rel(base, dir) };
  }
  return null;
}

const FEATURES = [
  ["schedules", /\bschedules\.(task|create)\b/],
  ["chat.agent", /\bchat\.agent\s*\(|@trigger\.dev\/sdk\/(ai|chat)\b/],
  ["batch", /\bbatchTrigger(AndWait)?\s*\(|\bbatch\.(trigger|triggerAndWait)\b/],
  ["waits", /\bwait\.(for|until|forToken|createToken)\b/],
  ["queues", /\bqueue\s*\(\s*\{|concurrencyKey|concurrency\s*:\s*\{/],
  ["schemaTask", /\bschemaTask\s*\(/],
  ["streams", /\bstreams\.(define|pipe|append|writer)\b|metadata\.stream\b/],
  ["metadata", /\bmetadata\.(set|update|append|increment)\b/],
  ["idempotency", /\bidempotencyKey/],
];

function scanFeatures(rootAbs, dirs, pkgs) {
  const found = new Set();
  const dirList = (dirs.length ? dirs : ["./src/trigger", "./trigger"]).map((d) => path.resolve(rootAbs, d));
  let files = 0;
  const walk = (dir, depth) => {
    if (depth > 5 || files > 150) return;
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (files > 150) return;
      const f = path.join(dir, e.name);
      if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(f, depth + 1);
      else if (e.isFile() && /\.(ts|tsx|js|jsx|mts|mjs)$/.test(e.name)) {
        files++;
        const t = readText(f, 200_000);
        if (t) for (const [name, re] of FEATURES) if (re.test(t)) found.add(name);
      }
    }
  };
  for (const d of dirList) walk(d, 0);
  for (const { pkg } of pkgs) {
    const deps = depVersions(pkg);
    if (deps["@trigger.dev/react-hooks"]) found.add("realtime-hooks");
  }
  return [...found].sort();
}

function envSignals(base) {
  const names = new Set();
  let apiUrl = null;
  let ents = [];
  try {
    ents = fs.readdirSync(base);
  } catch {}
  for (const n of ents) {
    if (!/^\.env(\..+)?$/.test(n)) continue;
    const t = readText(path.join(base, n), 100_000);
    if (!t) continue;
    for (const line of t.split("\n")) {
      const m = SIGNAL_ENV.exec(line);
      if (!m) continue;
      names.add(m[1]);
      if (m[1] === "TRIGGER_API_URL") {
        const v = m[2].trim().replace(/^["']|["']$/g, "");
        if (/^https?:\/\//.test(v)) apiUrl = v;
      }
    }
  }
  return { names: [...names], apiUrl };
}

function otherLanguages(base) {
  const langs = new Set();
  const marks = [["pyproject.toml", "python"], ["requirements.txt", "python"], ["Pipfile", "python"], ["go.mod", "go"], ["Gemfile", "ruby"], ["composer.json", "php"], ["pom.xml", "java"], ["build.gradle", "java"], ["build.gradle.kts", "java"], ["Cargo.toml", "rust"]];
  const check = (d) => {
    for (const [f, l] of marks) if (exists(path.join(d, f))) langs.add(l);
  };
  check(base);
  let ents = [];
  try {
    ents = fs.readdirSync(base, { withFileTypes: true });
  } catch {}
  for (const e of ents) if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) check(path.join(base, e.name));
  return [...langs].sort();
}

function packageManager(base, gitRoot, pkgs) {
  const stop = gitRoot || base;
  const lock = [["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["bun.lockb", "bun"], ["bun.lock", "bun"], ["package-lock.json", "npm"]];
  for (const [f, pm] of lock) if (nearestUp(base, stop, f)) return pm;
  const field = pkgs[0]?.pkg?.packageManager;
  if (typeof field === "string") return field.split("@")[0];
  return pkgs.length ? "npm" : null;
}

function workspaceTool(base) {
  const bits = [];
  if (exists(path.join(base, "pnpm-workspace.yaml")) || readJson(path.join(base, "package.json"))?.workspaces) bits.push("workspaces");
  for (const [f, n] of [["turbo.json", "turbo"], ["nx.json", "nx"], ["lerna.json", "lerna"]]) if (exists(path.join(base, f))) bits.push(n);
  return bits.length ? bits.join("+") : null;
}

function overlaps(base, gitRoot) {
  const skills = [];
  const dirs = [path.join(base, ".claude", "skills"), path.join(base, ".agents", "skills"), path.join(home(), ".claude", "skills")];
  if (gitRoot && gitRoot !== base) dirs.push(path.join(gitRoot, ".claude", "skills"), path.join(gitRoot, ".agents", "skills"));
  for (const d of dirs) for (const s of OFFICIAL_SKILLS) if (isDir(path.join(d, s))) skills.push(path.relative(base, path.join(d, s)).replace(/^(\.\.\/)+/, "~/"));
  let userMcp = false;
  for (const d of [base, gitRoot].filter(Boolean)) {
    const t = readText(path.join(d, ".mcp.json"), 200_000);
    if (t && /trigger\.dev(@[\w.-]+)?["']?\s*,\s*["']mcp|"trigger\.dev(@[\w.-]+)?"/.test(t)) userMcp = true;
  }
  let pointer = false;
  for (const f of ["CLAUDE.md", "AGENTS.md"]) {
    const t = readText(path.join(base, f), 100_000);
    if (t && /trigger-(tasks|setup|realtime|authoring|getting-started|cost-savings|chat-agent)|trigger\.dev[^\n]{0,60}skills?|skills?[^\n]{0,60}trigger\.dev/i.test(t)) pointer = true;
  }
  return { officialSkills: [...new Set(skills)], userMcpTrigger: userMcp, claudeMdPointer: pointer };
}

function worktreeInfo(base) {
  const dir = git(["rev-parse", "--git-dir"], base);
  const common = git(["rev-parse", "--git-common-dir"], base);
  if (!dir || !common) return null;
  if (path.resolve(base, dir) === path.resolve(base, common)) return null;
  const top = git(["rev-parse", "--show-toplevel"], base) || base;
  const name = path.basename(top).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 60);
  return { name };
}

export function profileApiUrl() {
  return null; // filled in once the CLI profile location is confirmed (spike S3)
}

export function detect(projDirIn, env = process.env) {
  const base = path.resolve(projDirIn || process.cwd());
  const gitTop = git(["rev-parse", "--show-toplevel"], base);
  const gitRoot = gitTop ? path.resolve(gitTop) : null;
  const configs = findConfigs(base, gitRoot);
  const pkgs = workspacePackages(base, gitRoot);
  const sig = envSignals(base);
  const signals = [];
  if (configs.length) signals.push("config");
  const pkgHit = pkgs.some(({ pkg }) => Object.keys(depVersions(pkg)).some((k) => k.startsWith("@trigger.dev/") || k === "trigger.dev"));
  if (pkgHit) signals.push("package");
  if (exists(path.join(base, "trigger", "package.json"))) signals.push("trigger-subpackage");
  if (sig.names.length) signals.push("env-names");

  const roots = configs.map((cfg) => {
    const dirAbs = path.dirname(cfg);
    const c = parseConfig(cfg);
    const sdk = installedVersion(dirAbs, gitRoot || base, "@trigger.dev/sdk");
    return { dir: rel(base, dirAbs), dirAbs, config: rel(base, cfg), ...c, _sdk: sdk };
  });

  const first = roots[0];
  const startDir = first ? first.dirAbs : base;
  const stop = gitRoot || base;
  const declared = depVersions(readJson(path.join(startDir, "package.json")) || pkgs.find((p) => depVersions(p.pkg)["@trigger.dev/sdk"])?.pkg);
  const names = ["@trigger.dev/sdk", "trigger.dev", "@trigger.dev/build"];
  const versions = {};
  const vkey = { "@trigger.dev/sdk": "sdk", "trigger.dev": "cli", "@trigger.dev/build": "build" };
  const seen = new Set();
  for (const n of names) {
    const inst = installedVersion(startDir, stop, n);
    const dec = declared[n] ? String(declared[n]).replace(/^[\^~>=<\s]+/, "") : null;
    if (inst) {
      versions[vkey[n]] = inst.version;
      seen.add(inst.version);
    } else if (dec) {
      versions[vkey[n]] = dec;
      seen.add(dec);
    }
  }
  for (const n of Object.keys(declared)) if (n.startsWith("@trigger.dev/") && !names.includes(n)) {
    const inst = installedVersion(startDir, stop, n);
    const v = inst ? inst.version : String(declared[n]).replace(/^[\^~>=<\s]+/, "");
    if (/^\d/.test(v)) seen.add(v);
  }
  versions.aligned = seen.size <= 1;
  versions.major = majorOf(versions.sdk);
  versions.source = installedVersion(startDir, stop, "@trigger.dev/sdk") ? "installed" : versions.sdk ? "declared" : null;
  const legacyV2 = Object.keys(declared).some((k) => k === "@trigger.dev/nextjs" || k === "@trigger.dev/react") && (majorOf(declared["@trigger.dev/sdk"]) || 0) < 3;
  if (legacyV2) versions.major = 2;

  const lang = otherLanguages(base);
  const callerOnly = !roots.length && pkgHit;
  const apiUrlEnv = env.TRIGGER_API_URL || sig.apiUrl || profileApiUrl();
  let target = { kind: "cloud" };
  if (apiUrlEnv && !DEFAULT_API.test(apiUrlEnv)) {
    let origin = apiUrlEnv;
    try {
      origin = new URL(apiUrlEnv).origin;
    } catch {}
    target = { kind: "self-host", url: origin };
  }
  const pinned = installedVersion(startDir, stop, "@trigger.dev/sdk");
  const pinnedDocs = pinned && isDir(path.join(pinned.dir, "docs")) ? `${rel(base, path.join(pinned.dir, "docs"))}/` : null;
  const features = first ? scanFeatures(first.dirAbs, first.dirs, pkgs) : scanFeatures(base, [], pkgs);
  const fp = {
    relevant: signals.length > 0,
    signals,
    projectDir: base,
    gitRoot,
    roots: roots.map(({ dirAbs, ...r }) => {
      const { _sdk, ...rest } = r;
      return rest;
    }),
    versions,
    packageManager: packageManager(base, gitRoot, pkgs),
    workspaces: workspaceTool(base),
    frontend: frontendOf(pkgs, base),
    ai: (() => {
      for (const { pkg } of pkgs) {
        const v = depVersions(pkg).ai;
        if (v) return { major: majorOf(v) };
      }
      return null;
    })(),
    features,
    otherLanguages: lang,
    callerOnly,
    target,
    pinnedDocs,
    overlaps: overlaps(base, gitRoot),
    worktree: worktreeInfo(base),
    envNames: sig.names,
    node: process.versions.node,
  };
  return fp;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** ≤ 700 chars of facts, priority-ordered; whole lines are dropped from the bottom. */
export function brief(fp, max = 700) {
  if (!fp.relevant) return "";
  const L = [];
  const r0 = fp.roots[0];
  if (r0) {
    const more = fp.roots.length > 1 ? ` (+${fp.roots.length - 1} more: ${fp.roots.slice(1, 3).map((r) => r.dir).join(", ")}${fp.roots.length > 3 ? ", …" : ""})` : "";
    L.push(`- root ${r0.dir}: ${path.basename(r0.config)}, project ${r0.projectRef || "(not in config)"}, dirs ${r0.dirs.join(" ") || "default"}${more}`);
  } else if (fp.callerOnly) {
    L.push("- caller-only: @trigger.dev/sdk is a dependency but no trigger.config.* exists here (tasks live elsewhere)");
  } else if (fp.signals.includes("trigger-subpackage")) {
    L.push("- polyglot: trigger/ subpackage without trigger.config.* at its root yet");
  } else {
    L.push(`- no trigger.config.* yet; Trigger.dev variable names found in .env files (${fp.envNames.join(", ")})`);
  }
  const v = fp.versions;
  if (v.sdk || v.cli || v.build) {
    const flag = v.major === 3 ? " · v3 (Cloud end of life)" : v.major === 2 ? " · v2 (end of life)" : "";
    L.push(`- ${[v.sdk && `@trigger.dev/sdk ${v.sdk}`, v.cli && `trigger.dev CLI ${v.cli}`, v.build && `@trigger.dev/build ${v.build}`].filter(Boolean).join(" · ")} (${v.aligned ? "aligned" : "MISMATCH"}${v.source === "declared" ? ", declared not installed" : ""})${flag}`);
  }
  const stack = [fp.packageManager && `package manager ${fp.packageManager}${fp.workspaces ? ` (${fp.workspaces})` : ""}`, fp.frontend && `frontend ${fp.frontend.framework}${fp.frontend.major ? ` ${fp.frontend.major}` : ""}${fp.frontend.router ? ` (${fp.frontend.router} router)` : ""}`, fp.ai && `ai ${fp.ai.major}.x`, fp.otherLanguages.length && `also ${fp.otherLanguages.join("/")}`].filter(Boolean);
  if (stack.length) L.push(`- ${stack.join(" · ")}`);
  if (fp.features.length) L.push(`- in use: ${fp.features.join(", ")}`);
  L.push(fp.target.kind === "self-host" ? `- target: self-hosted ${fp.target.url}` : "- target: Trigger.dev Cloud");
  if (r0 && r0.dir !== ".") L.push(`- MCP calls for this root: configPath=${r0.config}${r0.projectRef ? ` projectRef=${r0.projectRef}` : ""}`);
  if (fp.pinnedDocs) L.push(`- pinned docs: ${fp.pinnedDocs}`);
  if (fp.overlaps.officialSkills.length || fp.overlaps.claudeMdPointer) L.push("- official trigger-* skills also present (see /trigger-dev:doctor)");
  if (fp.worktree) L.push(`- git worktree "${fp.worktree.name}": TRIGGER_DEV_BRANCH=${fp.worktree.name} is exported; use \`trigger dev --branch\` so parallel sessions don't split runs`);
  const head = "Trigger.dev project facts (plugin trigger-dev):";
  let out = head;
  for (const l of L) {
    if (out.length + 1 + l.length > max) {
      if (out.length + 2 < max - 20) out += `\n${clip(l, max - out.length - 1)}`;
      break;
    }
    out += `\n${l}`;
  }
  return out;
}

/** SessionStart entry used by the hook: marker, worktree env export, pruning, hook JSON. `quiet` keeps the marker (so the guard stays armed) but prints nothing. */
export function sessionStart(payload, env = process.env) {
  const mode = steering(env);
  if (mode === "off") return null;
  const base = env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const fp = detect(base, env);
  if (!fp.relevant) return null;
  writeMarker(base, env);
  pruneData(env);
  if (mode !== "full") return null;
  if (fp.worktree && env.CLAUDE_ENV_FILE) {
    try {
      fs.appendFileSync(env.CLAUDE_ENV_FILE, `export TRIGGER_DEV_BRANCH=${JSON.stringify(fp.worktree.name)}\n`);
    } catch {}
  }
  return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: brief(fp) } };
}
