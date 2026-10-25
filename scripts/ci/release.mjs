#!/usr/bin/env node
// Automatic release for a Claude Code plugin repo. Installed copies update when the plugin's version string changes, so every
// change to what the plugin ships has to move the version; this does that on each merge to main.
//
//   node scripts/ci/release.mjs                 dry run: prints what it would do
//   node scripts/ci/release.mjs --execute       bumps both manifests, writes the CHANGELOG section, commits and tags locally
//   node scripts/ci/release.mjs --execute --bump minor|patch|major   force the level (workflow_dispatch)
//
// Rules
//   - Shipped paths are .claude-plugin/, .mcp.json, agents/, bin/, commands/, hooks/, references/, scripts/ (not scripts/ci/), skills/.
//     Nothing shipped changed since the last v* tag and no --bump: no release.
//   - The manifest version is already above the last tag (a human bumped it): release that version as it is.
//   - Otherwise bump from the commit subjects since the tag: "type!:" or BREAKING CHANGE = major (minor while < 1.0.0),
//     feat = minor, anything else = patch.
//   - Both manifests (plugin.json and marketplace.json, every entry with source ".") always carry the same version.
//   - GITHUB_OUTPUT gets release=true|false, version, tag, name.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const forced = args.includes("--bump") ? args[args.indexOf("--bump") + 1] : "";
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const gitOk = (...a) => {
  try {
    return git(...a);
  } catch {
    return "";
  }
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const out = (k, v) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

const PLUGIN = ".claude-plugin/plugin.json";
const MARKET = ".claude-plugin/marketplace.json";
const plugin = readJson(PLUGIN);
const market = fs.existsSync(MARKET) ? readJson(MARKET) : null;
const cmp = (a, b) => {
  const x = a.split(/[.-]/).slice(0, 3).map(Number);
  const y = b.split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
};

const lastTag = gitOk("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
const lastVersion = lastTag.replace(/^v/, "");
const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
const changed = (lastTag ? gitOk("diff", "--name-only", lastTag, "HEAD") : git("ls-files")).split("\n").filter(Boolean);
const SHIPPED = /^(\.claude-plugin\/|\.mcp\.json$|agents\/|bin\/|commands\/|hooks\/|references\/|scripts\/(?!ci\/)|skills\/)/;
const shippedChanges = changed.filter((f) => SHIPPED.test(f) && f !== PLUGIN && f !== MARKET);
const subjects = gitOk("log", "--no-merges", "--format=%s%n%b%x00", range).split("\0").map((s) => s.trim()).filter(Boolean);
const subjectLines = gitOk("log", "--no-merges", "--format=%s", range).split("\n").filter((s) => s && !/^chore\(release\)/.test(s));

let next;
let why;
if (lastTag && cmp(plugin.version, lastVersion) > 0) {
  next = plugin.version;
  why = `manifest already at ${plugin.version} (above ${lastTag}); releasing it as is`;
} else if (!lastTag && !forced) {
  next = plugin.version;
  why = "no v* tag yet; releasing the manifest version";
} else {
  let level = forced;
  if (!level) {
    if (!shippedChanges.length) {
      console.log(`no release: nothing shipped changed since ${lastTag} (${changed.length} files changed, none in the plugin's shipped paths)`);
      out("release", "false");
      process.exit(0);
    }
    level = subjects.some((s) => /^\w+(\([^)]*\))?!:/m.test(s) || /BREAKING CHANGE/.test(s)) ? "major" : subjects.some((s) => /^feat(\([^)]*\))?:/m.test(s)) ? "minor" : "patch";
  }
  const [maj, min, pat] = (lastVersion || plugin.version).split(".").map((n) => parseInt(n, 10) || 0);
  if (level === "major" && maj === 0) level = "minor"; // pre-1.0: a breaking change moves the minor
  next = level === "major" ? `${maj + 1}.0.0` : level === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
  why = `${level} bump from ${lastVersion || plugin.version}${forced ? " (forced)" : `, ${shippedChanges.length} shipped file(s) changed`}`;
}

const tag = `v${next}`;
const cliTag = `${plugin.name}--v${next}`;
if (gitOk("rev-parse", "-q", "--verify", `refs/tags/${tag}`)) {
  console.log(`no release: tag ${tag} already exists`);
  out("release", "false");
  process.exit(0);
}
console.log(`release ${tag}: ${why}`);
console.log(`  tags: ${tag}, ${cliTag}`);
console.log(`  changelog lines: ${subjectLines.length}`);
out("release", "true");
out("version", next);
out("tag", tag);
out("name", plugin.name);
if (!execute) process.exit(0);

// manifests
const writeJson = (f, o) => fs.writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`);
const rawPlugin = fs.readFileSync(PLUGIN, "utf8");
fs.writeFileSync(PLUGIN, rawPlugin.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`));
if (market) {
  // keep the file's own formatting: replace every "version" value, then undo it if that moved a plugin that lives elsewhere
  const raw = fs.readFileSync(MARKET, "utf8");
  const text = raw.replace(/("version"\s*:\s*")[^"]+(")/g, `$1${next}$2`);
  const before = readJson(MARKET);
  const after = JSON.parse(text);
  const foreign = (after.plugins || []).some((e, i) => e.source !== "." && e.version !== before.plugins[i].version);
  if (!foreign) fs.writeFileSync(MARKET, text);
  else {
    if (before.metadata) before.metadata.version = next;
    for (const e of before.plugins) if (e.source === ".") e.version = next;
    writeJson(MARKET, before);
  }
  for (const e of readJson(MARKET).plugins || []) if (e.source === "." && e.version !== next) throw new Error(`marketplace entry ${e.name} is at ${e.version}, expected ${next}`);
}
if (readJson(PLUGIN).version !== next) throw new Error("plugin.json version not updated");

// changelog
const CL = "CHANGELOG.md";
if (fs.existsSync(CL)) {
  const cl = fs.readFileSync(CL, "utf8");
  if (!new RegExp(`^## ${next.replace(/\./g, "\\.")}\\b`, "m").test(cl)) {
    const date = new Date().toISOString().slice(0, 10);
    const body = (subjectLines.length ? subjectLines : ["Maintenance release."]).map((l) => `- ${l}`).join("\n");
    const section = `## ${next}\n\n_${date}, automatic release from the commits since ${lastTag || "the start"}._\n\n${body}\n\n`;
    const at = cl.search(/^## /m);
    fs.writeFileSync(CL, at < 0 ? `${cl.trimEnd()}\n\n${section}` : `${cl.slice(0, at)}${section}${cl.slice(at)}`);
  }
}

git("add", PLUGIN, ...(market ? [MARKET] : []), ...(fs.existsSync(CL) ? [CL] : []));
git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-q", "-m", `chore(release): ${tag} [skip ci]`);
git("tag", "-a", tag, "-m", `${plugin.name} ${next}`);
git("tag", "-a", cliTag, "-m", `${plugin.name} ${next}`);
console.log(`committed and tagged ${tag}`);
