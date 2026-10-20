#!/bin/sh
# Gate for hooks that need Node: one `test -f` in repos where the marker exists, then exec the engine.
# No marker yet (the session began before this was a Trigger.dev project, e.g. /trigger-dev:init is creating it): one cheap sh
# signal check, and the marker is written here so the rest of the session is checked.
# usage: marker-gate.sh <trigger-ctx subcommand> [args...]
mode="${CLAUDE_PLUGIN_OPTION_STEERING:-full}"
case "$1" in
  lint) [ "$mode" = full ] || exit 0 ;;
  *) [ "$mode" = off ] && exit 0 ;;
esac
data="${CLAUDE_PLUGIN_DATA:-}"
[ -n "$data" ] || exit 0
plugin="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}"
. "$plugin/hooks/signal.sh"
root="${CLAUDE_PROJECT_DIR:-$PWD}"
marker="$data/projects/$(trigger_marker_key "$root")"
if [ ! -f "$marker" ]; then
  [ -n "$(trigger_signal "$root" fast)" ] || exit 0
  mkdir -p "$data/projects" 2>/dev/null && : > "$marker" 2>/dev/null
fi
command -v node >/dev/null 2>&1 || exit 0
exec node "$plugin/scripts/trigger-ctx.mjs" "$@"
