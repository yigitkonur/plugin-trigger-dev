// H3: prod guard. Input: PreToolUse hook payload. Output: a hook decision object, or null (no opinion).
// Why code and not permission rules: the failures are a MISSING flag (CLI defaults to prod) and tool defaults.
import fs from "node:fs";
import path from "node:path";
import { readJson, exists, hasMarker, projectDir } from "./util.mjs";

const DOC = {
  deploy: "https://trigger.dev/docs/cli-deploy-commands",
  promote: "https://trigger.dev/docs/cli-promote-commands",
  env: "https://trigger.dev/docs/cli-env-commands",
  runs: "https://trigger.dev/docs/cli-runs-commands",
  tasks: "https://trigger.dev/docs/cli-tasks-commands",
  mcp: "https://trigger.dev/docs/mcp-tools",
  keys: "https://trigger.dev/docs/apikeys",
};

const SUBCOMMANDS = new Set(["deploy", "promote", "env", "runs", "dev", "init", "login", "logout", "whoami", "update", "preview", "report", "projects", "list-profiles", "switch", "mcp", "install-mcp", "workers", "analyze", "typecheck", "tasks"]);
const GLOBAL_VALUE_FLAGS = new Set(["--profile", "--api-url", "-a", "--log-level", "-l"]);
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const RUNNER_FIRST = /^(npx|pnpx|pnpm|yarn|bun|bunx|npm|node|env|sudo|time|command|nohup|exec|corepack|volta|dotenv|dotenvx|doppler|infisical|op|cross-env)$/;

/** Split a shell command line into segments of words. Quotes are removed; operators split segments. */
export function shellSegments(cmd) {
  const segs = [];
  let words = [];
  let cur = "";
  let has = false;
  let q = null;
  const endWord = () => {
    if (has) words.push(cur);
    cur = "";
    has = false;
  };
  const endSeg = () => {
    endWord();
    if (words.length) segs.push(words);
    words = [];
  };
  const s = String(cmd || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
    } else if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      has = true;
    } else if (c === " " || c === "\t") endWord();
    else if (c === "\n" || c === ";" || c === "|" || c === "&" || c === "(" || c === ")" || c === "`") endSeg();
    else if (c === "$" && s[i + 1] === "(") {
      endSeg();
      i++;
    } else {
      cur += c;
      has = true;
    }
  }
  endSeg();
  return segs;
}

const isTriggerBin = (t) => /^(?:.*\/)?trigger(?:\.dev)?(?:@[\w.-]+)?(?:\.m?js)?$/.test(t);

/** Find trigger CLI invocations in a segment: [{sub, args}] */
function invocations(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (!isTriggerBin(words[i])) continue;
    const lead = words.slice(0, i).filter((w) => !ENV_ASSIGN.test(w));
    if (lead.length && !RUNNER_FIRST.test(lead[0])) continue;
    let j = i + 1;
    while (j < words.length && isTriggerBin(words[j])) j++; // `npx -p trigger.dev@latest trigger deploy`
    let sub = null;
    for (; j < words.length; j++) {
      const w = words[j];
      if (GLOBAL_VALUE_FLAGS.has(w)) {
        j++;
        continue;
      }
      if (w.startsWith("-")) continue;
      if (SUBCOMMANDS.has(w)) sub = w;
      break;
    }
    if (sub) {
      out.push({ sub, args: words.slice(j + 1) });
      break;
    }
  }
  return out;
}

// `--prod` is the 4.7.5+ shorthand for `--env prod` on deploy and promote.
export function hasExplicitEnv(args) {
  return args.some((a, i) => a === "--prod" || a === "--env" || a === "-e" || /^--env=./.test(a) || /^-e=./.test(a) || (/^-e[A-Za-z]/.test(a) && !a.startsWith("-env")) || (a === "-e" && args[i + 1] != null));
}

/** The environment a command names explicitly ("prod" for --prod), or null. */
export function explicitEnvValue(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--prod") return "prod";
    if (a === "--env" || a === "-e") return args[i + 1] ?? null;
    const m = /^(?:--env|-e)=(.+)$/.exec(a);
    if (m) return m[1];
  }
  return null;
}

const hasHelp = (args) => args.includes("--help") || args.includes("-h");

/** Decide for one trigger CLI invocation: returns {reason} when it needs an explicit environment, else null. */
export function cliFinding({ sub, args }) {
  const first = args.find((a) => !a.startsWith("-"));
  if (sub === "tasks" && first === "trigger" && !hasHelp(args) && explicitEnvValue(args) === "prod") {
    return { what: "trigger tasks trigger --env prod", doc: DOC.tasks, envs: "", why: "runs your production task with real side effects", ask: true };
  }
  if (hasHelp(args) || hasExplicitEnv(args)) return null;
  if (sub === "deploy") {
    if (args.includes("--dry-run")) return null;
    return { what: "trigger deploy", doc: DOC.deploy, envs: "staging|preview|prod", why: "deploys to prod when --env is omitted" };
  }
  if (sub === "promote") return { what: "trigger promote", doc: DOC.promote, envs: "staging|preview|prod", why: "promotes in prod when --env is omitted" };
  if (sub === "env") {
    if (first === "set") return { what: "trigger env set", doc: DOC.env, envs: "staging|preview|prod", why: "writes to the prod environment when --env is omitted" };
    if (first === "get") return { what: "trigger env get", doc: DOC.env, envs: "staging|preview|prod", why: "reads (and prints) a prod value when --env is omitted" };
    if (first === "pull") return { what: "trigger env pull", doc: DOC.env, envs: "staging|preview|prod", why: "writes the prod environment's variables, secrets included, into .env.local when --env is omitted" };
    if (first === "list" && args.includes("--show-values")) return { what: "trigger env list --show-values", doc: DOC.env, envs: "staging|preview|prod", why: "prints prod values (secrets included) when --env is omitted" };
    return null;
  }
  if (sub === "runs") {
    if (first === "cancel") return { what: "trigger runs cancel", doc: DOC.runs, envs: "dev|staging|preview|prod", why: "targets prod runs when --env is omitted" };
    if (first === "replay") return { what: "trigger runs replay", doc: DOC.runs, envs: "dev|staging|preview|prod", why: "replays in prod when --env is omitted" };
  }
  return null;
}

function cliFindings(command) {
  const res = [];
  for (const seg of shellSegments(command)) for (const inv of invocations(seg)) {
    const f = cliFinding(inv);
    if (f) res.push(f);
  }
  return res;
}

// Flags that consume the next word, per runner (pnpm -w is the boolean --workspace-root; npm -w takes a workspace name).
const PM_FLAG_VALUE = {
  npm: new Set(["--prefix", "-w", "--workspace"]),
  pnpm: new Set(["--filter", "-F", "-C", "--dir"]),
  yarn: new Set(["--cwd"]),
  bun: new Set(["--cwd", "--filter", "-F"]),
};
const PMS = new Set(["npm", "pnpm", "yarn", "bun"]);

/** `pnpm --filter jobs deploy:trigger -- --x` -> { name: "deploy:trigger", extra: ["--x"] } (script runners only). */
function parseRunner(words) {
  const w = words;
  let i = 0;
  while (i < w.length && ENV_ASSIGN.test(w[i])) i++;
  const pm = w[i];
  if (!PMS.has(pm)) return null;
  i++;
  while (i < w.length && w[i].startsWith("-")) i += PM_FLAG_VALUE[pm].has(w[i]) ? 2 : 1;
  if (w[i] === "run" || w[i] === "run-script") i++;
  else if (pm === "npm") return null; // `npm test` etc. are lifecycle commands, not named scripts
  while (i < w.length && w[i].startsWith("-")) i += PM_FLAG_VALUE[pm].has(w[i]) ? 2 : 1;
  const name = w[i];
  if (!name || name.startsWith("-")) return null;
  const extra = w.slice(i + 1);
  if (extra[0] === "--") extra.shift();
  return { name, extra };
}

function candidateDirs(dirs) {
  const out = [...dirs];
  for (const d of dirs) for (const parent of ["apps", "packages", "services"]) {
    try {
      for (const e of fs.readdirSync(path.join(d, parent), { withFileTypes: true })) if (e.isDirectory()) out.push(path.join(d, parent, e.name));
    } catch {}
  }
  return out;
}

function scriptBody(dirs, name) {
  for (const d of candidateDirs(dirs)) {
    const pj = readJson(path.join(d, "package.json"));
    if (pj?.scripts && typeof pj.scripts[name] === "string") return pj.scripts[name];
  }
  return null;
}

/** Resolve package.json scripts (depth-limited) and apply the CLI rules to their bodies. */
function aliasFindings(command, dirs) {
  const res = [];
  const seen = new Set();
  const visit = (text, depth) => {
    for (const seg of shellSegments(text)) {
      const r = parseRunner(seg);
      if (r && depth < 3) {
        const key = `${r.name}|${r.extra.join(" ")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const body = scriptBody(dirs, r.name);
        if (body) {
          visit(`${body} ${r.extra.join(" ")}`, depth + 1);
          continue;
        }
      }
      for (const inv of invocations(seg)) {
        const f = cliFinding(inv);
        if (f) res.push({ ...f, viaScript: depth > 0 });
      }
    }
  };
  visit(command, 0);
  return res;
}

const MCP_PREFIX = /^mcp__(?:plugin_trigger-dev_)?trigger__/;
// env-aware writes: [tool, default environment]. `deploy` has had a required environment since 4.7.5; the "prod" default only matters for older servers.
// Not guarded on purpose: create_dashboard and set_dashboard_widgets (custom dashboards, no run or production effect).
const MCP_ENV_WRITES = {
  deploy: "prod",
  trigger_task: "dev",
  cancel_run: "dev",
  replay_run: "dev",
  promote_prompt_version: "dev",
  create_prompt_override: "dev",
  update_prompt_override: "dev",
  remove_prompt_override: "dev",
  reactivate_prompt_override: "dev",
  start_agent_chat: "dev",
  write_session_channel: "dev",
  replay_webhook_delivery: "dev",
  create_alert: "dev",
  resolve_alert: "dev",
};
const MCP_ALWAYS_ASK = {
  initialize_project: "creates a cloud project and writes Trigger.dev files into this directory",
  create_project_in_org: "creates a project in a Trigger.dev organization",
  submit_feedback: "sends the text to the Trigger.dev team",
  generate_webhook_secret: "creates a signing secret for a webhook endpoint",
  set_webhook_secret: "replaces the signing secret of a webhook endpoint",
};
const MCP_PROD_REASON = {
  trigger_task: "runs your production task with real side effects",
  cancel_run: "cancels a live production run",
  replay_run: "starts a new production run from an old payload",
  promote_prompt_version: "changes the live prompt without a deploy",
  create_prompt_override: "changes live LLM behaviour in production without a deploy",
  update_prompt_override: "changes live LLM behaviour in production without a deploy",
  remove_prompt_override: "changes live LLM behaviour in production without a deploy",
  reactivate_prompt_override: "changes live LLM behaviour in production without a deploy",
  start_agent_chat: "starts a production chat, which spends real LLM budget",
  write_session_channel: "writes into a live production session",
  replay_webhook_delivery: "re-delivers a production webhook event",
  create_alert: "creates a live production alert that notifies your channels",
  resolve_alert: "closes a live production alert",
  deploy: "deploys to production",
};

const decision = (mode, kind, reason) => {
  const noPrompt = mode === "bypassPermissions" || mode === "dontAsk";
  // `implicit` = the caller can fix it by being explicit, so deny where a prompt isn't possible; `ask` has no explicit alternative.
  if (noPrompt && kind === "ask") return null;
  const d = noPrompt ? "deny" : "ask";
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: d, permissionDecisionReason: reason } };
};

function mcpDecision(tool, input, mode) {
  const name = tool.replace(MCP_PREFIX, "");
  if (MCP_ALWAYS_ASK[name]) {
    return decision(mode, "ask", `Trigger.dev ${name} ${MCP_ALWAYS_ASK[name]} (${DOC.mcp}).`);
  }
  if (!(name in MCP_ENV_WRITES)) return null;
  const given = input?.environment;
  const env = given ?? MCP_ENV_WRITES[name];
  if (env !== "prod") return null;
  if (given == null) {
    return decision(mode, "implicit", `Trigger.dev ${name} defaults to the prod environment when "environment" is omitted, and ${MCP_PROD_REASON[name]}. Pass environment explicitly ("dev", "staging", "preview", or "prod" if production is really intended) (${DOC.mcp}).`);
  }
  return decision(mode, "ask", `Trigger.dev ${name} with environment "prod" ${MCP_PROD_REASON[name]} (${DOC.mcp}).`);
}

export function guard(payload, { alias = false } = {}) {
  const tool = payload?.tool_name || "";
  const mode = payload?.permission_mode || "default";
  if (MCP_PREFIX.test(tool)) return mcpDecision(tool, payload.tool_input, mode);
  if (tool !== "Bash" && tool !== "PowerShell") return null;
  if (alias && !hasMarker(projectDir(payload))) return null; // script aliases only matter in Trigger.dev projects
  const command = payload?.tool_input?.command || "";
  const dirs = [...new Set([payload?.cwd, process.env.CLAUDE_PROJECT_DIR].filter(Boolean))];
  let findings = alias ? [] : cliFindings(command);
  if (!findings.length) findings = aliasFindings(command, dirs);
  if (!findings.length) return null;
  const f = findings[0];
  const via = f.viaScript ? " (inside a package.json script)" : "";
  if (f.ask) return decision(mode, "ask", `${f.what}${via} ${f.why} (${f.doc}).`);
  return decision(
    mode,
    "implicit",
    `${f.what}${via} ${f.why}. Add --env ${f.envs} to be explicit (${f.doc}).`,
  );
}

export const MCP_GUARDED = [...Object.keys(MCP_ENV_WRITES), ...Object.keys(MCP_ALWAYS_ASK)];

export const _internal = { invocations, exists };
