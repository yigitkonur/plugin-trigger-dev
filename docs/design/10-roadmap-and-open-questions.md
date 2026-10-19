# 10 — Roadmap, evals, risks and open questions

## 1. Phase 0: spikes (≈ 2 days)

Nothing in the design depends on these outcomes; each has a fallback.

| Spike | Question | Fallback if the answer is "no" |
|---|---|---|
| S1 | Does a PreToolUse `ask` prompt under `bypassPermissions`? | Already handled: H3 returns `deny` + reason in `bypassPermissions`/`dontAsk`. |
| S2 | Do leading-`*` Bash `if` patterns (`Bash(*trigger deploy*)`) match compound commands (`cd apps/jobs && pnpm exec trigger deploy`)? | Broaden to one `Bash(*trigger*)` handler; the script still exits silently on non-matches. |
| S3 | Where does the CLI store the current profile's `apiUrl`? | Self-host detection via MCP `whoami` (shows the API URL) on first use, and `TRIGGER_API_URL`. |
| S4 | Does MCP `start_dev_server` support dev branches, and does it run the project's CLI or `@latest`? | Worktrees and version-pinned projects use CLI `dev` via Bash (already the plan for worktrees). |
| S5 | Does `` !`…` `` injection run when the model invokes a skill (plugin-swiftui says no)? | Model-invoked skills already don't rely on it. |
| S6 | `tools/list` snapshot from `npx trigger.dev@latest mcp` | Update the H3 regex, the `run-investigator` tools and [07 §2](07-mcp-vs-cli.md). |
| S7 | Hook latency on 3 repo types ([05 §6](05-steering-and-hooks.md)) | Move work from H1 to on-demand `detect`. |
| S8 | Windows without Git Bash, `onFailure: continue` | README states Git Bash is needed for H1/H2. H3 is exec-form node and unaffected. |
| S9 | Precision of the 14 hook rules on ≥ 20 public repos | Rules below 95% drop to audit tier. |

**Exit:** spike notes committed; snapshot committed; latency numbers recorded.

## 2. Phases

| Phase | Ships | Exit criteria (watched working, not just written) |
|---|---|---|
| **1 — MVP** | • manifest + `.mcp.json`<br>• `trigger-ctx detect\|guard\|docs`<br>• **H1 + H3**<br>• `build` (protocol, invariants, 13 cards, discovery)<br>• `init` (stage-5 failure → `get_run_details` + link index)<br>• `references/link-index.md`, `traps.md`, `limits.md`, `mcp-vs-cli.md`<br>• README | • `claude plugin validate --strict` passes.<br>• Scenario #1 and #2 run end to end on a fresh repo with a proven run.<br>• H3 asks on `trigger deploy` without `--env` and on `npm run deploy:trigger`.<br>• Scenario #12: no output, ≤ 30 ms.<br>• Link CI green. |
| **2 — Checks & depth** | • `rules.json` (134) + `lint\|scan`<br>• **H2**<br>• `audit` + `code-auditor`<br>• `chat-agent` + 10 playbooks<br>• `diagnose` + `run-investigator`<br>• `new` | • Scenarios #3, #4, #5, #7, #10 pass.<br>• Hook-rule precision ≥ 95% on the corpus.<br>• `audit --fix` round-trips on a seeded repo (findings → commits → clean re-scan). |
| **3 — Ship & measure** | • `ship`, `doctor`<br>• H4 if evals show flailing<br>• eval suite<br>• CI freshness jobs<br>• marketplace listing | • Scenarios #8, #9, #11, #13 pass.<br>• Eval Δ ≥ +0.4.<br>• Negative cases 100%.<br>• Freshness CI weekly. |

## 3. Eval plan (`claude plugin eval`)

- **~24 positive cases**, one or two per scenario card, each chat playbook family, `diagnose` symptoms and init.
- **6 negative cases**:
  - Celery/Django
  - Sidekiq/Rails
  - BullMQ in Node without Trigger.dev
  - GitHub Actions cron
  - "write a cron expression"
  - a Go service
  - `build` must not load, and no hook output.
- **Graders:**
  - regex (correct imports, `batchTriggerAndWait`, explicit `--env`, ownership check present)
  - `trigger-ctx lint` on generated code as an oracle (0 hook-tier hits)
  - `tsc --noEmit` against the SDK
  - an LLM grader for "asked ≤ 2 questions, stated assumptions, cited a doc URL"
  - `tool_used: Skill` graders are reported but excluded from Δ ([plugin evals](https://code.claude.com/docs/en/plugin-evals))
- **MCP mocks** (`evals/mocks/trigger/*.md`): `get_report`, `list_runs`, `get_run_details`, `trigger_task`, `get_current_worker`. Runs are isolated `-p` sessions with MCP mocked by default.
- AskUserQuestion is granted in eval settings so discovery can be graded.
- **Baseline:** the same cases without the plugin, and (separately) with the official skills installed. The second comparison is the honest "10x" check.

## 4. Success metrics

| Metric | Target |
|---|---|
| Eval Δ (plugin − no plugin), regex/LLM graders | ≥ +0.4 |
| Eval Δ (plugin − official skills) | > 0 on every scenario family |
| Negative cases: `build` not loaded, no hook output | 100% |
| Hook-tier false-positive rate on the public-repo corpus | < 2% of hits |
| Non-Trigger repo per-session overhead | no output, ≤ 30 ms |
| Standing context in Trigger.dev projects | ≈ 900 tokens |
| Doc links and anchors | 100% resolve in CI |

## 5. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Chat API churn (GA July 2026, fast changelog) | high | Link + version gate + weekly CI on bundled docs and `traps.md`; playbooks hold decisions, not signatures. |
| Webhooks/Slack/Linear beta churn | high | `beta` flags; availability question; non-beta fallback paths. |
| MCP tool renames under `@latest` | medium | Snapshot diff in CI; both prefixes; H3 regex generated from the snapshot. |
| Claude Code spec changes (hook fields, skill limits) | medium | `validate --strict` in CI; minimum version in README; `onFailure` everywhere. |
| False positives erode trust in H2 | medium | ≥ 95% precision bar, `applies_when`, dedupe, `steering=quiet`. |
| Overlap/conflict with the official skills | medium | `doctor` detects both name sets and the CLAUDE.md pointer; open question 1. |
| Windows without Git Bash | low | `onFailure: continue`; H3 exec-form node; README. |
| Users run the plugin at user scope and pay context everywhere | medium | README + `doctor` recommend project scope; scenario #12 acceptance test. |
| Implicit prod via paths the guard can't see (CI scripts, Makefiles, a shell alias) | medium | DEP-10 in audits; the guard covers the common script runners; invariant 8 in `build`. Documented as a residual risk. |

## 6. Verification of this plan

Checks run once on these 11 files on 2026-10-20 (docs-only change). Output as printed.

| Check | Command | Result |
|---|---|---|
| Doc pages resolve | `curl -sL -m 20 -w '%{http_code}'` on the `.md` variant of every unique `trigger.dev/docs` and `code.claude.com/docs` URL (162 pages) | `161 200` · `1 404` = `llms.txt` (the checker appended `.md`); `https://trigger.dev/docs/llms.txt` itself → `200`. `trigger.dev/pricing`, `trigger.dev/webhooks-beta`, `github.com/triggerdotdev/skills`, `github.com/yigitkonur/plugin-swiftui` → `200`. `github.com/yigitkonur/plugin-trigger-dev` is a placeholder (open question 5). |
| Anchors resolve | `anchors.py` (Mintlify slugs + in-page links) on all 36 `#anchor` URLs | `OK` × 36, `MISS` × 0 |
| Snippets validate | snippets from [04 §4](04-plugin-architecture.md), [04 §8](04-plugin-architecture.md), [05 §2](05-steering-and-hooks.md) and [06 §1](06-flows-init-consult-audit.md) written to a scratch plugin; `claude plugin validate --strict` (Claude Code 2.1.302) | `✔ Validation passed`. Negative controls show the validator does check `hooks.json` (bad event → `✘ Validation failed`) and `.mcp.json` (bad type → `✘ Validation failed`). |
| Frontmatter parses | PyYAML `safe_load` on the `build`, `init` and `run-investigator` frontmatter (the validator does **not** check this: a broken frontmatter still passed) | first run: `FAIL build: mapping values are not allowed here` (unquoted `code: tasks`) → descriptions rephrased without `: ` → rerun `OK` × 3 |
| Rule catalog integrity | parse every rule row in [06 §4.3](06-flows-init-consult-audit.md) | `rules: 134 unique: 134 star: 14` · families `MIG 11, TSK 30, QUE 6, SCH 7, RT 12, CHT 25, WH 6, CFG 12, DEP 13, COST 7, OPS 5` · rows without doc URL: none · H2 list == ★ set: `True` · MIG version gates stated (note added under the MIG table) |
| Traceability | need IDs per row in [04 §2](04-plugin-architecture.md); six answers per hook in [05 §3](05-steering-and-hooks.md); skill coverage in [02 §5](02-official-skills-audit.md) | rows without need IDs: none · H1–H4: `6/6` each · 02 §5 rows: setup 6, tasks 11, realtime 3, cost 6, chat-authoring 5, advanced 12, all 2, building-with-ai 1 |
| Cross-references | every `[NN §x]` and `NN-*.md` link | broken: none |
| Self-host safety | grep `api.trigger.dev` / `cloud.trigger.dev` | 3 hits, all stated as the default or flagged: 03 A9 (with "Self-host: use `TRIGGER_API_URL`"), 06 RT-11 (a rule *against* hard-coding it), 07 §7 ("`TRIGGER_API_URL` if set, else …"). |

Not verified here: hook latency, rule precision on real repos, and the Phase-0 spikes (§1). These need the built plugin.

## 7. Open questions (only ones that change the design)

1. **Relationship to the official skills.**
   - **Supersede** (plan default): `doctor` recommends removing `.claude/skills/trigger-*` and the CLI's CLAUDE.md pointer, and never deletes anything itself.
   - **Coexist**: the plugin defers API detail to the installed SDK skills and drops overlapping cards.
   - *Changes:* `doctor`, the card scope, and the eval baseline.
2. **MCP write-safety default.**
   - **Full server + H3 guard** (plan default).
   - **Ship `--dev-only`** (no prod deploys from MCP; the CLI handles them).
   - **Ship `--readonly`** (no writes at all from MCP).
   - *Changes:* `.mcp.json`, H3(c), and the init/new proof-run path (`--readonly` hides `trigger_task`).
3. **Webhooks/Slack/Linear depth in v1.**
   - **Detection + fallback now, full playbooks in phase 3** (plan default).
   - **Full from day one** (beta churn risk).
   - *Changes:* the size of `webhook-driven` and `server-and-channel-callers`, and the WH rules.
4. **Node for the linter and guard.**
   - **OK that H2/H3/audit need Node** (plan default): it's skipped without Node, and Trigger.dev projects have Node anyway.
   - **sh-only** with weaker rules (no JSON parsing, no script-alias resolution).
   - *Changes:* the engine language and the rule precision.
5. **Distribution and surfaces.**
   - Personal marketplace (`yigitkonur/…`, plan default) vs upstreaming to Trigger.dev.
   - Claude Code only (keeps `bin/`, plan default) vs also claude.ai/Cowork (drop the top-level `bin/`; skills call `node "${CLAUDE_PLUGIN_ROOT}/scripts/trigger-ctx.mjs"`).
   - *Changes:* the repo name, `bin/`, and the maintenance owner.

## Sources
https://code.claude.com/docs/en/plugin-evals · https://code.claude.com/docs/en/plugins-reference · https://code.claude.com/docs/en/hooks · https://trigger.dev/docs/mcp-introduction · https://trigger.dev/docs/ai-chat/changelog
