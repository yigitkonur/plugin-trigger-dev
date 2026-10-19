#!/bin/sh
# Gate for hooks that need Node: one `test -f` in repos without Trigger.dev, then exec the engine.
# usage: marker-gate.sh <trigger-ctx subcommand> [args...]
mode="${CLAUDE_PLUGIN_OPTION_STEERING:-full}"
case "$1" in
  lint) [ "$mode" = full ] || exit 0 ;;
  *) [ "$mode" = off ] && exit 0 ;;
esac
data="${CLAUDE_PLUGIN_DATA:-}"
[ -n "$data" ] || exit 0
key=$(printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}" | tr -c 'A-Za-z0-9._-' '_')
[ -f "$data/projects/$key" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
plugin="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}"
exec node "$plugin/scripts/trigger-ctx.mjs" "$@"
