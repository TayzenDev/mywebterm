#!/bin/sh
# Ouvre http://term.localhost sans « :8080 ». launchd (root) écoute sur le port 80
# de 127.0.0.1 et ::1 uniquement ; à chaque connexion, il lance `nc` sous votre
# compte pour la relayer vers le terminal. Le serveur garde son port et ses droits.
#
#   sudo scripts/port80.sh install [port]
#   sudo scripts/port80.sh uninstall
set -eu

LABEL=local.mywebterm.port80
PLIST=/Library/LaunchDaemons/$LABEL.plist

if [ "$(id -u)" -ne 0 ] || [ -z "${SUDO_USER:-}" ]; then
  echo "À lancer avec sudo, depuis votre compte." >&2
  exit 1
fi

remove() {
  launchctl bootout system "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
}

case "${1:-}" in
  install)
    PORT=${2:-8080}
    remove
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>UserName</key><string>$SUDO_USER</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/nc</string><string>127.0.0.1</string><string>$PORT</string>
  </array>
  <key>inetdCompatibility</key>
  <dict><key>Wait</key><false/></dict>
  <key>Sockets</key>
  <dict>
    <key>IPv4</key>
    <dict>
      <key>SockNodeName</key><string>127.0.0.1</string>
      <key>SockServiceName</key><string>80</string>
    </dict>
    <key>IPv6</key>
    <dict>
      <key>SockNodeName</key><string>::1</string>
      <key>SockServiceName</key><string>80</string>
    </dict>
  </dict>
</dict>
</plist>
EOF
    launchctl bootstrap system "$PLIST"
    echo "Port 80 → $PORT : http://term.localhost"
    ;;
  uninstall)
    remove
    echo "Redirection supprimée."
    ;;
  *)
    echo "Usage : sudo $0 install [port] | uninstall" >&2
    exit 1
    ;;
esac
