// links-check: every cited trigger.dev/docs and code.claude.com/docs page must answer 200 (as .md), every #anchor must exist.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKIP_DIRS } from "./util.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const URL_RE = /https:\/\/(?:trigger\.dev\/docs|code\.claude\.com\/docs)\/[A-Za-z0-9_\-./]+(?:#[A-Za-z0-9_\-.]+)?/g;
const TEXT_EXT = /\.(md|mdx|json|mjs|js|yml|yaml|txt)$/;

export function slug(h) {
  return h.replace(/`/g, "").trim().toLowerCase().replace(/[.\s/]+/g, "-").replace(/[^\w-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function collectUrls(root = ROOT) {
  const urls = new Map(); // url -> first file
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") && e.name !== ".github") continue;
      if (SKIP_DIRS.has(e.name) || e.name === "results") continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (TEXT_EXT.test(e.name) && !/snapshot\.json$/.test(e.name)) {
        const t = fs.readFileSync(f, "utf8");
        for (const m of t.matchAll(URL_RE)) {
          const u = m[0].replace(/[.,;:]+$/, "");
          if (/\/docs\/?$/.test(u)) continue; // a bare base URL in prose
          if (!urls.has(u)) urls.set(u, path.relative(root, f));
        }
        if (e.name === "link-index.md") {
          // rows list pages relative to the docs root; check them (and their anchors) like full URLs
          for (const line of t.split("\n")) {
            const cells = line.split("|").map((c) => c.trim());
            if (cells.length < 7 || !line.startsWith("|") || /^[-\s|]+$/.test(line) || cells[1] === "key") continue;
            for (const p of cells[2].split(",").map((x) => x.trim()).filter((x) => /^[a-z0-9][\w/#.-]*$/i.test(x))) {
              const u = `https://trigger.dev/docs/${p}`;
              if (!urls.has(u)) urls.set(u, path.relative(root, f));
            }
          }
        }
      }
    }
  };
  walk(root);
  return urls;
}

const mdUrl = (page) => (/\/llms(-full)?\.txt$/.test(page) ? page : `${page.replace(/\/$/, "")}.md`);

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

async function get(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(25000) });
      return { status: r.status, text: r.ok ? await r.text() : "" };
    } catch (e) {
      if (attempt) return { status: 0, text: "", error: String(e.message || e) };
    }
  }
}

export async function linksCheck({ anchors = false, root = ROOT } = {}) {
  const urls = collectUrls(root);
  const pages = new Map(); // page -> [anchors]
  for (const [u, f] of urls) {
    const [page, anchor] = u.split("#");
    if (!pages.has(page)) pages.set(page, { file: f, anchors: new Set() });
    if (anchor) pages.get(page).anchors.add(anchor);
  }
  const failures = [];
  const results = await pool([...pages.entries()], 8, async ([page, info]) => {
    const r = await get(mdUrl(page));
    if (r.status !== 200) {
      failures.push({ url: page, status: r.status, file: info.file, error: r.error });
      return;
    }
    if (anchors && info.anchors.size) {
      const heads = new Set();
      for (const line of r.text.split("\n")) {
        const m = /^#{1,6}\s+(.*)$/.exec(line);
        if (m) heads.add(slug(m[1]));
      }
      for (const m of r.text.matchAll(/id="([^"]+)"/g)) heads.add(m[1]);
      for (const a of info.anchors) if (!heads.has(a)) failures.push({ url: `${page}#${a}`, status: "anchor-missing", file: info.file });
    }
  });
  return { checkedPages: pages.size, checkedUrls: urls.size, failed: failures.length, failures, anchors };
}
