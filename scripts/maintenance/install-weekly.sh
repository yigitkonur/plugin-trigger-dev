#!/bin/bash
# Installs the weekly upkeep job as a macOS LaunchAgent: Monday 09:17, and at every login when a week has passed (reboot-safe).
# usage: scripts/maintenance/install-weekly.sh [--uninstall]
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$HOME/.claude/bin/trigger-dev-weekly"
PLIST="$HOME/Library/LaunchAgents/com.yigit.trigger-dev-weekly.plist"
LABEL="com.yigit.trigger-dev-weekly"
if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST" "$BIN"; echo "removed $LABEL"; exit 0
fi
mkdir -p "$HOME/.claude/bin" "$HOME/Library/Logs" "$HOME/Library/LaunchAgents"
cp "$HERE/weekly.sh" "$BIN" && chmod +x "$BIN"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$BIN</string></array>
  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>17</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/trigger-dev-weekly.err</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL (script $BIN, log ~/Library/Logs/trigger-dev-weekly.log). Stop: touch ~/.claude/trigger-dev-weekly.off"
