#!/bin/sh
# H1 (SessionStart): Trigger.dev project fingerprint. Silent (no output, exit 0) outside Trigger.dev projects.
# Cheapest checks first; Node only runs when a signal exists.
mode="${CLAUDE_PLUGIN_OPTION_STEERING:-full}"
[ "$mode" = off ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || exit 0
plugin="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}"
. "$plugin/hooks/signal.sh"

signal=$(trigger_signal "$root")
[ -n "$signal" ] || exit 0

if command -v node >/dev/null 2>&1; then
  exec node "$plugin/scripts/trigger-ctx.mjs" detect --hook
fi

# No Node: write the marker and print the sh-only subset.
data="${CLAUDE_PLUGIN_DATA:-}"
if [ -n "$data" ]; then
  key=$(trigger_marker_key "$root")
  mkdir -p "$data/projects" 2>/dev/null && : > "$data/projects/$key" 2>/dev/null
fi
[ "$mode" = full ] || exit 0
printf 'Trigger.dev project facts (plugin trigger-dev, shell-only: Node was not found, so versions and layout were not analysed):\n- signal: %s\n- target: Trigger.dev Cloud unless TRIGGER_API_URL says otherwise\n' "$signal"
exit 0
