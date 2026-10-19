#!/bin/sh
# H1 (SessionStart): Trigger.dev project fingerprint. Silent (no output, exit 0) outside Trigger.dev projects.
# Cheapest checks first; Node only runs when a signal exists.
mode="${CLAUDE_PLUGIN_OPTION_STEERING:-full}"
[ "$mode" = off ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || exit 0
plugin="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}"

signal=""
for f in trigger.config.ts trigger.config.mts trigger.config.cts trigger.config.js trigger.config.mjs */trigger.config.* */*/trigger.config.*; do
  if [ -e "$f" ]; then signal="config"; break; fi
done
if [ -z "$signal" ] && [ -f package.json ] && grep -qs -e '"@trigger.dev/' -e '"trigger.dev"' package.json; then signal="package"; fi
if [ -z "$signal" ] && [ -f trigger/package.json ]; then signal="trigger-subpackage"; fi
if [ -z "$signal" ]; then
  for f in .env .env.*; do
    [ -f "$f" ] || continue
    if grep -qs -E '^[[:space:]]*(export[[:space:]]+)?TRIGGER_(SECRET_KEY|API_URL|PROJECT_REF|ACCESS_TOKEN)=' "$f"; then signal="env-names"; break; fi
  done
fi
if [ -z "$signal" ] && command -v git >/dev/null 2>&1; then
  if [ -n "$(git ls-files -- '*trigger.config.*' 2>/dev/null | head -n 1)" ]; then signal="config"; fi
fi
[ -n "$signal" ] || exit 0

if command -v node >/dev/null 2>&1; then
  exec node "$plugin/scripts/trigger-ctx.mjs" detect --hook
fi

# No Node: write the marker and print the sh-only subset.
data="${CLAUDE_PLUGIN_DATA:-}"
if [ -n "$data" ]; then
  key=$(printf '%s' "$root" | tr -c 'A-Za-z0-9._-' '_')
  mkdir -p "$data/projects" 2>/dev/null && : > "$data/projects/$key" 2>/dev/null
fi
[ "$mode" = full ] || exit 0
printf 'Trigger.dev project facts (plugin trigger-dev, shell-only: Node was not found, so versions and layout were not analysed):\n- signal: %s\n- target: Trigger.dev Cloud unless TRIGGER_API_URL says otherwise\n' "$signal"
exit 0
