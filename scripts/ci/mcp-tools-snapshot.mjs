#!/usr/bin/env node
// Prints a normalized tools/list snapshot of the official Trigger.dev MCP server.
// usage: node mcp-tools-snapshot.mjs [--cmd "npx -y trigger.dev@latest mcp"]   (stdout: JSON)
// Normalized = name, annotations, and per-parameter type/enum/default/required; descriptions are dropped so
// the CI diff only fires on surface changes (renamed tools, changed defaults), not wording.
import { spawn } from "node:child_process";

const i = process.argv.indexOf("--cmd");
const cmd = (i > 0 ? process.argv[i + 1] : "npx -y trigger.dev@latest mcp").split(/\s+/);
const child = spawn(cmd[0], cmd.slice(1), { stdio: ["pipe", "pipe", "ignore"] });
let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d;
  let n;
  while ((n = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, n).trim();
    buf = buf.slice(n + 1);
    if (!line) continue;
    try {
      const m = JSON.parse(line);
      if (m.id && pending.has(m.id)) pending.get(m.id)(m);
    } catch {}
  }
});
const call = (id, method, params) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout ${method}`)), 90000);
    pending.set(id, (m) => { clearTimeout(t); res(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });

try {
  await call(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "tdp-snapshot", version: "0" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const r = await call(2, "tools/list", {});
  const tools = r.result.tools
    .map((t) => ({
      name: t.name,
      readOnly: t.annotations?.readOnlyHint ?? null,
      destructive: t.annotations?.destructiveHint ?? null,
      params: Object.fromEntries(
        Object.entries(t.inputSchema?.properties ?? {}).map(([k, v]) => [
          k,
          { type: v.type ?? null, ...(v.enum ? { enum: v.enum } : {}), ...("default" in v ? { default: v.default } : {}), required: (t.inputSchema?.required ?? []).includes(k) },
        ]),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  process.stdout.write(JSON.stringify({ count: tools.length, tools }, null, 1) + "\n");
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  child.kill();
}
