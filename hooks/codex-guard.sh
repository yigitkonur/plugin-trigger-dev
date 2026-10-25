#!/bin/sh
# Codex PreToolUse (Bash): Codex hooks have no `if` filter, so this one sh test decides whether Node starts at all.
# Only commands that mention trigger or run a package script (npm/pnpm/yarn/bun) reach the engine; everything else costs a `case`.
input=$(cat)
case "$input" in
  *trigger*|*npm*|*pnpm*|*yarn*|*bun*) ;;
  *) exit 0 ;;
esac
command -v node >/dev/null 2>&1 || exit 0
plugin="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}}"
[ -r "$plugin/scripts/trigger-ctx.mjs" ] || exit 0
printf '%s' "$input" | node "$plugin/scripts/trigger-ctx.mjs" guard
exit 0
