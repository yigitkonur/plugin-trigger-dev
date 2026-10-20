// Shared helpers for trigger-ctx. Zero dependencies (node:* only).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

export const SCHEMA_VERSION = 1;
export const CONFIG_RE = /^trigger\.config\.(ts|mts|cts|js|mjs)$/;
export const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".turbo", ".trigger", ".venv", "venv", "__pycache__",
  "vendor", "target", ".cache", "coverage", ".output", ".nuxt", ".svelte-kit", ".pnpm-store", ".yarn", ".idea",
]);

/** full | quiet | off. An unset or unknown value means full (the host omits unset options). */
export function steering(env = process.env) {
  const v = String(env.CLAUDE_PLUGIN_OPTION_STEERING || "full").trim().toLowerCase();
  return v === "quiet" || v === "off" ? v : "full";
}

/** Reads fd 0 to EOF. A pipe whose writer has not written yet makes readSync throw EAGAIN (readFileSync(0) gives up on it), so retry for up to 3 s. */
function readAllStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  const sleep = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 3000;
  for (;;) {
    let n;
    try {
      n = fs.readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === "EAGAIN" && Date.now() < deadline) {
        Atomics.wait(sleep, 0, 0, 5);
        continue;
      }
      if (e.code === "EOF") break;
      throw e;
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function readStdinJson() {
  try {
    if (process.stdin.isTTY) return {};
    const raw = readAllStdin();
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function readText(file, max = 400_000) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > max) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function readJson(file) {
  const t = readText(file, 2_000_000);
  if (t == null) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 3000, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Marker key: every byte outside [A-Za-z0-9._-] becomes "_". hooks/signal.sh builds the same key with `LC_ALL=C tr -c` (byte-wise; in a UTF-8 locale BSD tr would map whole characters). */
export function markerKey(projectDir) {
  return Buffer.from(String(projectDir), "utf8")
    .toString("latin1")
    .replace(/[^A-Za-z0-9._-]/g, "_");
}

export function projectDir(payload = {}) {
  return process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
}

export function markerPath(projDir, env = process.env) {
  const data = env.CLAUDE_PLUGIN_DATA;
  if (!data) return null;
  return path.join(data, "projects", markerKey(projDir));
}

export function writeMarker(projDir, env = process.env) {
  const p = markerPath(projDir, env);
  if (!p) return false;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${new Date().toISOString()}\n`);
    return true;
  } catch {
    return false;
  }
}

export function hasMarker(projDir, env = process.env) {
  const p = markerPath(projDir, env);
  return p ? exists(p) : false;
}

/** Remove markers and dedupe files not touched for `days` days. */
export function pruneData(env = process.env, days = 7) {
  const data = env.CLAUDE_PLUGIN_DATA;
  if (!data) return;
  const cutoff = Date.now() - days * 86_400_000;
  for (const sub of ["projects", "dedupe"]) {
    const dir = path.join(data, sub);
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      try {
        const f = path.join(dir, n);
        if (fs.statSync(f).mtimeMs < cutoff) fs.rmSync(f, { force: true });
      } catch {}
    }
  }
}

export function envelope(result, { ok = true, next_actions = [], error = null } = {}) {
  return { ok, schema_version: SCHEMA_VERSION, result, next_actions, error };
}

export function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

export function majorOf(v) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")) || /(\d+)(?:\.(\d+))?/.exec(String(v || ""));
  return m ? Number(m[1]) : null;
}

/** semver-ish compare of x.y.z strings; returns -1/0/1, or null when either side is unparseable. */
export function cmpVersion(a, b) {
  const pa = /(\d+)\.(\d+)\.(\d+)/.exec(String(a || ""));
  const pb = /(\d+)\.(\d+)\.(\d+)/.exec(String(b || ""));
  if (!pa || !pb) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function home() {
  return os.homedir();
}
