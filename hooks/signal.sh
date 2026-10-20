# Sourced by session-start.sh and marker-gate.sh (one copy, so the two cannot disagree about what "a Trigger.dev project" is).
# trigger_signal <dir> [fast] prints why <dir> looks like one (config | package | trigger-subpackage | env-names) or nothing. Cheapest checks first; no Node.
# `fast` skips the `git ls-files` fallback (tracked configs deeper than two levels), which only SessionStart needs: the gate runs on every edit.
trigger_signal() {
  (
    cd "$1" 2>/dev/null || exit 0
    fast="$2"
    for f in trigger.config.ts trigger.config.mts trigger.config.cts trigger.config.js trigger.config.mjs */trigger.config.* */*/trigger.config.*; do
      if [ -e "$f" ]; then echo config; exit 0; fi
    done
    if [ -f package.json ] && grep -qs -e '"@trigger.dev/' -e '"trigger.dev"' package.json; then echo package; exit 0; fi
    if [ -f trigger/package.json ]; then echo trigger-subpackage; exit 0; fi
    for f in .env .env.*; do
      [ -f "$f" ] || continue
      if grep -qs -E '^[[:space:]]*(export[[:space:]]+)?TRIGGER_(SECRET_KEY|API_URL|PROJECT_REF|ACCESS_TOKEN)=' "$f"; then echo env-names; exit 0; fi
    done
    [ -n "$fast" ] && exit 0
    if command -v git >/dev/null 2>&1 && [ -n "$(git ls-files -- '*trigger.config.*' 2>/dev/null | head -n 1)" ]; then echo config; fi
  )
}

# trigger_marker_key <dir> prints the marker file name. Byte-wise (LC_ALL=C) on purpose: Node's markerKey() maps every UTF-8 byte
# outside [A-Za-z0-9._-] to "_", while BSD tr in a UTF-8 locale maps every character, so a path like ~/Masaüstü would get two different keys.
trigger_marker_key() {
  printf '%s' "$1" | LC_ALL=C tr -c 'A-Za-z0-9._-' '_'
}
