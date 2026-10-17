# mywebterm

My local terminal, in the browser, built on [ghostty-web](https://github.com/coder/ghostty-web).
Inspired by [tweety](https://github.com/pomdtr/tweety).

Each browser tab is a real shell on your Mac, with your Ghostty theme and font. The URL keeps the
tab's directory and running program, so a reload or a bookmark reopens it where you left it, down
to the same Claude Code conversation.

- **The URL is the state**: `/~/Dev/project?c=htop` opens a shell there and starts htop; the URL
  follows every `cd`. → [URLs](docs/urls.md)
- **Tabs you can tell apart**: titles and favicons from the running program or agent, or a name you
  choose. → [Tab title and favicon](docs/tabs.md)
- **Notifications** when an agent is done or waiting for you, while you look elsewhere.
  → [Notifications](docs/notifications.md)
- **Feels like Ghostty**: theme and font from your Ghostty config, mouse support, `Cmd +/-`,
  pasting a screenshot for an agent. → [In the terminal](docs/terminal.md)
- **Terminal tabs grouped** in Chrome and Firefox ([extension](docs/extension.md)), or in a folder
  per space in Zen ([mod](docs/zen-mod.md)).
- **Local only**: listens on 127.0.0.1, access token, signed commands. → [Security](docs/security.md)

## Quick start

Requires macOS, Node.js and zsh.

```bash
npm install
npm start
# → http://term.localhost:8080/#token=…
```

Open the printed address once: the page keeps the token for that address. Then:

- start the server at login: `scripts/autostart.sh install`;
- drop the `:8080`: `sudo scripts/port80.sh install` → `http://term.localhost`;
- get notified by Claude Code: register `bin/claude-notify-hook` as a hook
  ([how](docs/notifications.md)).

More in [Setup](docs/setup.md), and everything else in the [documentation](docs/README.md).

## Acknowledgements

- [ghostty-web](https://github.com/coder/ghostty-web) by Coder, which brings
  [Ghostty](https://ghostty.org)'s terminal emulator to the browser: mywebterm is built on it, and
  Ghostty itself, by Mitchell Hashimoto and its contributors, is where the theme, font and
  configuration come from.
- [tweety](https://github.com/pomdtr/tweety) by pomdtr, an integrated terminal for the browser that
  inspired this project.
- [node-pty](https://github.com/microsoft/node-pty), [ws](https://github.com/websockets/ws) and
  [simple-icons](https://simpleicons.org), which do much of the work.
- [Sine](https://github.com/CosmoCreeper/Sine), which makes JavaScript mods possible in Zen.

## License

[MIT](LICENSE)
