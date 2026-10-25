#!/usr/bin/env node
// trigger-ctx: deterministic engine for the trigger-dev plugin. Zero dependencies, Node >= 18. Always exits 0.
//   detect [--brief|--json|--hook] [--latest] [--dir <path>]   project fingerprint (--hook: SessionStart output + marker; --latest: also ask npm how far behind the SDK is)
//   guard [--alias]                                 PreToolUse prod guard (hook stdin -> decision JSON or nothing)
//   lint --hook | lint <files...> [--all]           tripwire rules (hook tier by default, --all adds audit tier)
//   scan [path] [--focus <d>] [--json]              relevance per domain + all located hits
//   docs <topic|path|name>                          resolve a doc page (local pinned copy -> web .md); a name (catchError) also reports the installed SDK types and @deprecated notes
//   links-check [--anchors]                         status/anchor check of every cited doc URL
import { envelope, emit, readStdinJson, steering, projectDir, hasMarker, writeMarker } from "./lib/util.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith("--") && !(i > 0 && arr[i - 1].startsWith("--") && ["--dir", "--focus", "--rules"].includes(arr[i - 1])));

async function main() {
  switch (cmd) {
    case "detect": {
      const { detect, brief, sessionStart } = await import("./lib/detect.mjs");
      if (flag("--hook")) {
        const out = sessionStart(process.env.CLAUDE_PROJECT_DIR ? {} : readStdinJson());
        if (out) emit(out);
        return;
      }
      const fp = detect(opt("--dir") || projectDir());
      // --latest asks npm what is newest (network, 4 s cap). The session-start hook never does; doctor and build do.
      let fresh = null;
      if (flag("--latest") && fp.versions?.sdk) {
        const { latestSdk } = await import("./lib/util.mjs");
        fresh = await latestSdk(fp.versions.sdk);
        if (fresh) Object.assign(fp.versions, { latest: fresh.latest, behind: fresh.behind });
      }
      if (flag("--brief")) {
        const b = brief(fp);
        const note = fresh ? (fresh.behind ? `\n- SDK is ${fresh.behind} behind latest ${fresh.latest}: offer \`npx trigger.dev@latest update\` (the user may keep a pin)` : `\n- SDK is current (latest ${fresh.latest})`) : "";
        process.stdout.write(b ? `${b}${note}\n` : "No Trigger.dev signals found in this project.\n");
        return;
      }
      emit(envelope(fp, { next_actions: fp.relevant ? [] : [{ cmd: "/trigger-dev:init", why: "no Trigger.dev setup detected" }] }));
      return;
    }
    case "guard": {
      if (steering() === "off") return;
      const { guard } = await import("./lib/guard.mjs");
      const payload = readStdinJson();
      if (flag("--alias") && !hasMarker(projectDir(payload))) {
        // The sh gate arms the marker itself; this is the PowerShell path, which calls the engine directly.
        const { detect } = await import("./lib/detect.mjs");
        if (!detect(projectDir(payload)).relevant) return;
        writeMarker(projectDir(payload));
      }
      const out = guard(payload, { alias: flag("--alias") });
      if (out) emit(out);
      return;
    }
    case "lint": {
      const { lintHook, lintFiles } = await import("./lib/lint.mjs");
      if (flag("--hook")) {
        if (steering() !== "full") return;
        const out = lintHook(readStdinJson());
        if (out) emit(out);
        return;
      }
      emit(envelope(lintFiles(positional, { all: flag("--all"), rulesFile: opt("--rules") })));
      return;
    }
    case "scan": {
      const { scan } = await import("./lib/lint.mjs");
      emit(envelope(scan(positional[0] || projectDir(), { focus: opt("--focus"), tier: opt("--tier") })));
      return;
    }
    case "docs": {
      const { docs } = await import("./lib/docs.mjs");
      emit(envelope(docs(positional.join(" "), projectDir())));
      return;
    }
    case "links-check": {
      const { linksCheck } = await import("./lib/links.mjs");
      const r = await linksCheck({ anchors: flag("--anchors") });
      emit(envelope(r, { ok: r.failed === 0 }));
      return;
    }
    default:
      process.stdout.write("usage: trigger-ctx detect|guard|lint|scan|docs|links-check\n");
  }
}

try {
  await main();
} catch (e) {
  if (process.env.TRIGGER_CTX_DEBUG) console.error(e);
  if (cmd && !["guard", "lint", "detect"].includes(cmd)) emit(envelope(null, { ok: false, error: String(e?.message || e) }));
}
process.exitCode = 0;
