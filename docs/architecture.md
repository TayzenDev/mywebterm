# How it works

```
browser (ghostty-web)  ⇄  WebSocket /pty  ⇄  server.js (node-pty)  ⇄  zsh
```

Each tab opens its own WebSocket, and the server starts a shell for it (`$SHELL -l`) in a real
pseudo-terminal.

- `public/index.html`: the ghostty-web terminal, which sends keystrokes and resizes, and reads the
  sequences that drive the URL, the title, the favicon and notifications.
- `server.js`: serves the page and the library, checks the token and the origin, and connects each
  WebSocket to a pseudo-terminal.
- `ghostty-config.js`: reads the Ghostty config and theme, served at `/config.json`.
- `fonts.js`: finds the files of an installed font family.
- `icons.js`: serves the favicons of known programs (`/icons/<slug>.svg`).
- `bin/title`, `bin/notify`: commands added to the shells' `PATH`, which rename the tab and send a
  notification.
- `bin/claude-notify-hook`: Claude Code hook that notifies the tab (see
  [Notifications](notifications.md)).
- `shell-integration/zsh/.zshenv`: reports the current directory and the running command to the
  page (see [Tab title](tabs.md)).
- `scripts/autostart.sh`, `scripts/port80.sh`: LaunchAgent and LaunchDaemon installers (see
  [Setup](setup.md)).
- `extension/`, `zen-mod/`: group terminal tabs in the browser (see [Extension](extension.md) and
  [Zen mod](zen-mod.md)).
