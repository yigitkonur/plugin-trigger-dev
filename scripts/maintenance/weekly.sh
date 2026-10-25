#!/bin/bash
# Weekly upkeep of the trigger-dev plugin, run by a LaunchAgent (see install-weekly.sh).
# Fresh clone -> drift checks -> only if something drifted: headless Claude Code session with the AGENTS.md loop
# -> tests -> PR -> merge on green CI. The release workflow then publishes by itself.
# Stop it: touch ~/.claude/trigger-dev-weekly.off      Force a run now: FORCE=1 ~/.claude/bin/trigger-dev-weekly
# Dry run (checks only, no Claude, no PR): DRY=1
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.claude/local:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="${REPO:-yigitkonur/plugin-trigger-dev}"
LOG="$HOME/Library/Logs/trigger-dev-weekly.log"
STAMP="$HOME/.claude/trigger-dev-weekly.last"
OFF="$HOME/.claude/trigger-dev-weekly.off"
LOCK="$HOME/.claude/trigger-dev-weekly.lock"
BUDGET="${BUDGET:-12}"
log() { echo "$(date '+%F %T') $*" >> "$LOG"; }
note() { osascript -e "display notification \"$1\" with title \"trigger-dev weekly\"" >/dev/null 2>&1 || true; }
mkdir -p "$(dirname "$LOG")" "$HOME/.claude"

[ -e "$OFF" ] && { log "kill switch $OFF present; nothing done"; exit 0; }
if [ -z "${FORCE:-}" ] && [ -e "$STAMP" ] && [ -z "$(find "$STAMP" -mtime +6 2>/dev/null)" ]; then
  log "ran within the last 6 days; nothing to do"; exit 0
fi
mkdir "$LOCK" 2>/dev/null || { if [ -n "$(find "$LOCK" -mmin +240 2>/dev/null)" ]; then rmdir "$LOCK"; mkdir "$LOCK"; else log "another run holds the lock"; exit 0; fi; }
W="$(mktemp -d /tmp/tdp-weekly.XXXXXX)"
cleanup() { rmdir "$LOCK" 2>/dev/null; [ -n "${KEEP:-}" ] || rm -rf "$W"; }
trap cleanup EXIT
fail() { log "FAILED: $*"; note "failed: $*"; KEEP=1; log "work dir kept: $W"; exit 1; }

command -v gh >/dev/null && command -v node >/dev/null && command -v git >/dev/null || fail "gh, node and git must be on PATH"
gh repo clone "$REPO" "$W/repo" -- --quiet >>"$LOG" 2>&1 || fail "clone $REPO"
cd "$W/repo" || fail "cd"
log "start: $(git rev-parse --short HEAD) of $REPO"

drift=0
{
  echo "## upstream-check"; node scripts/ci/upstream-check.mjs; r=$?; echo "(exit $r)"; [ $r -eq 2 ] && echo NETWORK
  echo; echo "## mcp tools snapshot vs committed"
  node scripts/ci/mcp-tools-snapshot.mjs > "$W/mcp.json" 2>/dev/null && diff scripts/ci/mcp-tools.snapshot.json "$W/mcp.json" && echo "(same)"
  echo; echo "## deprecated names taught as current"; node scripts/ci/sdk-surface.mjs --latest 2>&1 | tail -20
  echo; echo "## links"; node scripts/trigger-ctx.mjs links-check --anchors 2>/dev/null | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(`${j.result.checkedPages} pages, ${j.result.failed} failures`);for(const f of j.result.failures)console.log(f.status,f.url,"in",f.file)'
} > "$W/report.txt" 2>&1
grep -q '^NETWORK' "$W/report.txt" && fail "no network"
node scripts/ci/upstream-check.mjs >/dev/null 2>&1; [ $? -eq 1 ] && drift=1
grep -q '^(same)' "$W/report.txt" || drift=1
grep -qE '[1-9][0-9]* failures' "$W/report.txt" && drift=1
if [ $drift -eq 0 ]; then log "no drift; plugin is current"; touch "$STAMP"; exit 0; fi
log "drift found: $(grep -cE '^\[|^NEWER|^< |^> ' "$W/report.txt") report lines"
[ -n "${DRY:-}" ] && { log "DRY run: report at $W/report.txt, stopping before Claude"; cat "$W/report.txt" >> "$LOG"; KEEP=1; exit 0; }

BRANCH="upstream/$(date +%F)"
git checkout -q -b "$BRANCH" || fail "branch"
PROMPT="You maintain the Claude Code plugin in the current directory (a fresh clone of $REPO, branch $BRANCH). Read AGENTS.md fully, above all 'Keeping up with upstream' and 'Why tests, and which ones are necessary'. The drift report from today's automatic checks is in $W/report.txt. Run the loop from AGENTS.md: classify each upstream change, diff the evidence (tarball docs, types, MCP snapshot, CLI help), change only what a user would notice, update the guard tables and tests when behaviour changes, then run the 'Before you push' line from AGENTS.md until it passes, refresh scripts/ci/mcp-tools.snapshot.json when the MCP tools changed, update mcpToolCount, and finish with 'node scripts/ci/upstream-check.mjs --write'. Commit on this branch with conventional subjects (feat: for new guidance or behaviour, fix: for corrections, chore: if only references/upstream.json moved); do not push, the caller does. This is headless and nobody can answer questions: decide, and write each decision into the last commit body. Do not run evals. Do not change files outside this directory and never print secrets."
timeout_run() { perl -e 'alarm shift; exec @ARGV' "$@"; }
log "claude session start (budget \$$BUDGET)"
timeout_run 5400 claude -p "$PROMPT" --permission-mode bypassPermissions --model claude-sonnet-5-5 --max-budget-usd "$BUDGET" --no-session-persistence >"$W/claude.out" 2>&1
log "claude exit $? ; $(tail -c 300 "$W/claude.out" | tr '\n' ' ')"

[ -n "$(git status --porcelain)" ] && { git add -A && git commit -q -m "chore: reconcile with upstream (uncommitted leftovers from the weekly session)"; }
[ "$(git rev-list --count origin/HEAD..HEAD 2>/dev/null || git rev-list --count HEAD ^origin/main)" -gt 0 ] || fail "Claude made no commit"

( node tests/rules.test.mjs && node tests/guard.test.mjs && node tests/detect.test.mjs && node tests/seed.test.mjs && node tests/replay.test.mjs && node tests/marker.test.mjs && node scripts/build-hooks.mjs --check ) >"$W/tests.out" 2>&1 || { tail -15 "$W/tests.out" >> "$LOG"; fail "tests failed after the session"; }
node scripts/ci/upstream-check.mjs >/dev/null 2>&1 && log "upstream-check: current" || log "upstream-check still reports drift (see PR)"

git push -q -u origin "$BRANCH" >>"$LOG" 2>&1 || fail "push"
TITLE="$(git log -1 --format=%s)"
gh pr create --repo "$REPO" --base main --head "$BRANCH" --title "$TITLE" --body "Weekly upstream reconcile (automatic). Drift report:

\`\`\`
$(head -c 6000 "$W/report.txt")
\`\`\`

Tests from AGENTS.md rule 10 passed locally. Evals were not run; run the cases that touch the changed cards before relying on the steering change. Codex review skipped (headless job)." >"$W/pr.url" 2>>"$LOG" || fail "pr create"
PR="$(cat "$W/pr.url")"; log "opened $PR"
sleep 20
gh pr checks "$PR" --watch --interval 30 >>"$LOG" 2>&1 || fail "CI not green on $PR; left open"
gh pr merge "$PR" --squash --delete-branch >>"$LOG" 2>&1 || fail "merge $PR"
log "merged $PR"; touch "$STAMP"; note "merged $PR"
