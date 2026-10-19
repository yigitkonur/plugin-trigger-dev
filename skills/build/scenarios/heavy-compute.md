# Heavy compute: browser, media, Python, native (`heavy-compute`)
**You're building:** a task that runs headless Chrome, ffmpeg, Python or native addons on a sized machine.  **Not this card if:** the work is only API or DB calls (`background-job`), or a non-TypeScript caller triggers the task (`polyglot-caller`).

**Primitives:**
- `puppeteer()` (`@trigger.dev/build/extensions/puppeteer`) — because it installs Chrome and sets `PUPPETEER_EXECUTABLE_PATH` on deploy builds, so you never set that variable yourself.
- `ffmpeg()` (`@trigger.dev/build/extensions/core`) — because it sets `FFMPEG_PATH` and `FFPROBE_PATH` for `fluent-ffmpeg`, which also goes in `external`.
- `pythonExtension({ scripts, requirementsFile })` (`@trigger.dev/python/extension`) with `python.runScript` — because it adds Python to the image and puts scripts at the same path in `dev` and deploy.
- `machine` preset plus `retry: { outOfMemory: { machine } }` — because a child process such as ffmpeg counts toward the machine's memory limit, and the retry escalates only on OOM.
- `heartbeats.yield()` — because a synchronous CPU loop blocks heartbeats; a run with no heartbeat for 5 minutes is stalled.
- Rejected: `aptGet({ packages: ["ffmpeg"] })` — because it only installs the package in the image; `ffmpeg()` also wires the `fluent-ffmpeg` paths.

**Gates:** Deploy-time only: `puppeteer()` does nothing in `dev`, and `requirementsFile` is prod-only (`devPythonBinaryPath` covers dev).. No beta or version gate on these pages.

**Ask only if unknown:**
1. Peak memory per run, and is it known from the payload? Decides a bigger preset up front, a per-trigger `machine` override, or only the OOM retry.
2. Does Python need third-party packages or only your own scripts? Packages need `requirementsFile` (deployed builds only), scripts alone need `scripts`.

**Minimal shape:**
```ts
// trigger.config.ts: build.extensions [puppeteer(), ffmpeg(), pythonExtension({ scripts, requirementsFile })]; build.external ["sharp", "fluent-ffmpeg"]
import { task, heartbeats } from "@trigger.dev/sdk";
import { python } from "@trigger.dev/python";

export const render = task({
  id: "render",
  machine: "medium-1x",
  retry: { outOfMemory: { machine: "large-1x" } },
  run: async (payload: { items: string[] }) => {
    for (const item of payload.items) {
      await heartbeats.yield(); // sync CPU work on item
    }
    return python.runScript("./python/process.py", [String(payload.items.length)]);
  },
});
```

**Pitfalls → rules:**
- `puppeteer()` is a no-op in `dev`; local Puppeteer uses its own downloaded browser, so never set `PUPPETEER_EXECUTABLE_PATH` there. `@trigger.dev/build` must be a devDependency at the SDK version. (CFG-09)
- Chrome, ffmpeg or `python.runScript` used without its extension. (CFG-01, CFG-03, CFG-04)
- Native addons (`sharp`, `re2`, `sqlite3`) missing from `external`; the symptom is `No loader is configured for ".node" files`. (CFG-05)
- Synchronous CPU loop without `heartbeats.yield()`; the run is marked stalled after 5 minutes. (TSK-13)
- Memory-heavy task on the default `small-1x` (0.5 GB) with no OOM escalation; ffmpeg children count toward the limit. (TSK-29)

**Docs:** `config/extensions/overview` · `machines` · `runs/heartbeats` · `config/extensions/puppeteer` · `config/extensions/ffmpeg` · `config/extensions/pythonExtension` · `config/extensions/aptGet`
