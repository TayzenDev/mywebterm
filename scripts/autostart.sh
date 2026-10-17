#!/bin/sh
# Starts the terminal when you log in (macOS LaunchAgent, as your user), and
# restarts it if it stops. At login, the server opens its address with the
# token in your default browser, until a page there has the token (--open).
#
#   scripts/autostart.sh install
#   scripts/autostart.sh uninstall
#
# PORT, MYWEBTERM_DOMAIN, MYWEBTERM_HOST and ALLOWED_HOSTS set when installing
# are kept. Logs: ~/Library/Logs/mywebterm.log
set -eu

LABEL=local.mywebterm
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
LOG=$HOME/Library/Logs/mywebterm.log
DIR=$(cd "$(dirname "$0")/.." && pwd)

if [ "$(id -u)" -eq 0 ]; then
  echo "Run without sudo, from your own account." >&2
  exit 1
fi

remove() {
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
}

# XML-escaped <key>/<string> pair, only if the variable is set
env_entry() {
  eval "value=\${$1-}"
  [ -n "$value" ] || return 0
  value=$(printf '%s' "$value" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')
  printf '    <key>%s</key><string>%s</string>\n' "$1" "$value"
}

case "${1:-}" in
  install)
    # launchd starts agents with a bare PATH: use this node (the one node-pty
    # was built for), and pass the shell and locale (UTF-8 in the terminal)
    NODE=$(command -v node) || { echo "node not found in PATH." >&2; exit 1; }
    remove
    mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string><string>$DIR/server.js</string><string>--open</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
$(SHELL=${SHELL:-/bin/zsh} LANG=${LANG:-en_US.UTF-8}
  for name in SHELL LANG LC_ALL PORT MYWEBTERM_DOMAIN MYWEBTERM_HOST ALLOWED_HOSTS; do env_entry "$name"; done)
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Starts at login (logs: $LOG)."
    ;;
  uninstall)
    remove
    echo "Autostart removed."
    ;;
  *)
    echo "Usage: $0 install | uninstall" >&2
    exit 1
    ;;
esac
