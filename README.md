# mywebterm

My local terminal, in the browser, built on [ghostty-web](https://github.com/coder/ghostty-web).
Inspired by [tweety](https://github.com/pomdtr/tweety).

```bash
npm install
npm start
# → http://127.0.0.1:8080/#token=…
```

Each tab runs its own shell (`$SHELL -l`).

The first start creates an access token in `~/.config/mywebterm/token` (readable by you only) and
prints the address with it. Open that address once: the page keeps the token for that address
(`127.0.0.1:8080`, `localhost:8080` and `term.localhost` each need it once) and removes it from the
URL. Without it, the page asks for it. Delete the file and restart the server to change the token.

## Open in a directory

The URL path is the starting directory:

| URL                                     | Directory                                  |
| --------------------------------------- | ------------------------------------------ |
| `http://127.0.0.1:8080/`                | home                                       |
| `http://127.0.0.1:8080/~/Dev/project`   | `~/Dev/project`                            |
| `http://127.0.0.1:8080/Users/me/Dev`    | `/Users/me/Dev`                            |
| `http://127.0.0.1:8080/Dev/project`     | `/Dev/project`, otherwise `~/Dev/project`  |

If the directory doesn't exist, the shell opens in your home directory with a warning.
The paths `/fonts/…`, `/ghostty-web/…` and `/config.json` are reserved.

The URL then follows the current directory on every `cd` (zsh only, not during `ssh`): reloading
the page or bookmarking it reopens the shell in the same place.

## Run a command

`?command=` (or `?c=`) types a command at the first prompt, in the URL's directory:
`http://127.0.0.1:8080/~/Dev/project?c=htop`. It stays in the history, and you get the shell back
when it exits.

It only runs automatically if you opened the tab yourself: address bar, bookmark, or a link from
the terminal itself (`Sec-Fetch-Site` header). When opened from another site, it is only typed:
press Enter to run it, Ctrl+C to cancel.

After that, `?c=` follows the running program if it is in the `PROGRAMS` table (htop, vim,
lazygit, tmux, ssh, claude…): reloading the page or bookmarking it starts it again. The parameter
goes away when the prompt comes back. Other commands (`npm install`, `git push`…) are never put
there, so that a reload doesn't run them again, nor are `psql`/`pgcli`, whose command line often
contains a password.

For AI agents, a reload must reopen **the same conversation**, even with several sessions in the
same directory. The zsh integration therefore wraps `claude` and `pi`: when started without an
explicit session, they get an identifier chosen up front (`--session-id <uuid>`), and the URL gets
their resume command (`?c=claude --resume <uuid>`, `?c=pi --session-id <uuid>`). Options from the
original command line (`--model`…) are not kept. Limitations: a new session started from inside
the agent (`/clear`, `/resume`…) is not tracked, and a `claude` or `pi` function in your `.zshrc`
overrides this one. codex and opencode can't be given a session identifier at startup: for them,
the URL keeps the command line as typed.

The title sent by the agent (the session name for Claude Code) is kept alongside, in `?t=`: the tab
shows it as soon as it reloads, without waiting for the agent to send it again. It goes away with
`?c=` when the prompt comes back.

## Tab title

In order of priority:

1. **A name you chose**, kept in the URL (`?title=API`): it survives reloads and bookmarks.
   - click the badge in the top right corner, or press `Ctrl+Shift+R`;
   - or run `title API` in the terminal (`title` with no argument → automatic title).
   An empty name goes back to the automatic title.
2. **The running program** (`PROGRAMS` table in `public/index.html`), until the prompt comes back,
   taking precedence over titles the program sends itself:
   - tmux, herdr, vim, lazygit, htop, psql, man…: the program name;
   - `ssh`: `ssh <host>` (e.g. `ssh -p 22 me@prod-1` → `ssh prod-1`);
   - AI agents (claude, opencode, codex, aider, gemini): the title they send. Claude Code and
     opencode put the session name there; the status symbol in front of it ("✳", spinner…) is
     removed since the favicon already shows it. Otherwise, their name.
3. **Automatic title**: the name of the current directory, updated on every `cd` (zsh only), or a
   title sent by a program (OSC 0/2 sequences). The most recent one wins.

To track the directory and commands, the server starts zsh with `ZDOTDIR=shell-integration/zsh`:
this `.zshenv` restores your `ZDOTDIR`, loads your usual config, then adds two hooks. `precmd` sends
the current directory (OSC 7 sequence) and reports that the prompt is back; `preexec` sends the
command being run. Nothing to change in your `.zshrc`.

## Favicon

By default, a command prompt in the theme's colors. While a program from the `PROGRAMS` table is
running, its icon: a [simple-icons](https://simpleicons.org) logo (CC0) on the brand color, served
from `/icons/<slug>.svg`, or an emoji for those without a logo.

## Notifications

When an agent is done or waiting for an answer, the tab lets you know, **if you're not looking at
it** (tab in the background, or browser window behind another application):

- a browser notification, which brings you back to the tab when clicked. You need to allow it once
  with the "🔔 Enable notifications" button in the top right corner (shown until you accept or
  decline). One notification per tab: the next one replaces the previous one;
- a "●" before the tab title and a dot on the favicon, even without the permission. They go away
  when you come back to the tab, and the notification closes.

The page handles terminal notification sequences: OSC 9 (iTerm2), OSC 777 (rxvt, Ghostty) and
OSC 99 (kitty). Programs that emit them work as is, and the `notify` command sends one from the
shell:

```bash
make test; notify "tests done"            # tab title + message
notify "Build" "failed at step 3"         # title + message
```

**Claude Code**: register `bin/claude-notify-hook` as a hook in `~/.claude/settings.json`. It
notifies when Claude is done (`Stop`, with the start of its answer), asks for a permission
(`Notification`), or asks a question / proposes a plan (`PreToolUse` on `AskUserQuestion` and
`ExitPlanMode`). The "waiting for your input" reminder, one minute after it's done, is ignored.
Outside mywebterm (no `MYWEBTERM` variable), the hook does nothing.

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "/path/to/mywebterm/bin/claude-notify-hook" }] }],
    "Notification": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "/path/to/mywebterm/bin/claude-notify-hook" }] }],
    "PreToolUse": [{ "matcher": "AskUserQuestion|ExitPlanMode", "hooks": [{ "type": "command", "command": "/path/to/mywebterm/bin/claude-notify-hook" }] }]
  }
}
```

Shells get `TERM_PROGRAM=mywebterm` rather than the value of the terminal that started the server:
otherwise agents would think they run in Ghostty (or another terminal) and pick their sequences
accordingly. Inside tmux, the hook's sequence only gets through with `set -g allow-passthrough on`.

## Mouse

When a program enables mouse reporting (vim `set mouse=a`, htop, tmux `mouse on`…), left/middle/
right clicks, drags, motion and the wheel are forwarded to it (SGR 1006 and X10 formats, modes
9/1000/1002/1003), with Shift/Alt/Ctrl. Otherwise, the usual behavior: drag to select, wheel to
scroll the history, right click for the menu. Holding **Shift** forces text selection even when
the program captures the mouse.

## Pasting an image

ghostty-web only pastes text, and it swallows Ctrl+V. Two ways to give a screenshot to Claude Code
(or another agent):

- **Cmd+V**: if the clipboard only holds an image, the page sends it to the server, which saves it
  in the temporary directory (`$TMPDIR/mywebterm-paste-<date>.png`) and pastes its path. Claude Code
  recognizes a pasted image path and attaches it.
- **Ctrl+V** (macOS): forwarded to the program, as in Ghostty. Claude Code then reads the Mac
  clipboard itself.

Both assume the program runs on this Mac: through `ssh`, the path points to a file that doesn't
exist on the remote machine, and Ctrl+V reads a different clipboard.

## Theme

Colors come from your Ghostty config (`~/.config/ghostty/config`): the chosen `theme` (looked up in
`~/.config/ghostty/themes`, then in Ghostty.app), overridden by `palette`, `background`,
`foreground`… set directly in the config. `theme = light:X,dark:Y` follows the system appearance.
`font-size` (13 by default, as in Ghostty on macOS), `font-thicken` and `window-padding-x/y` are
also used.

The font follows `font-family` (several lines = fallback fonts). The server looks for the `.ttf`/
`.otf` files of that family in the system font directories (`~/Library/Fonts`, `/Library/Fonts`…)
and serves them to the page under `/fonts/<id>`: Safari has no access to user-installed fonts. A
font that can't be found as a file (e.g. Menlo, a `.ttc`) is requested from the browser by name.
Without `font-family`, Menlo is used.

The config is read again on every page load: after changing it in Ghostty, reload.

## Address: term.localhost

`http://term.localhost:8080` works with no setup: macOS, Chrome, Firefox and Safari send every
`*.localhost` name to the machine itself (127.0.0.1 or ::1; the server listens on both). Any
`.localhost` name works (`webterm.localhost`…). Avoid `.local`, which is reserved for Bonjour/mDNS
on macOS: it would need an `/etc/hosts` entry, and name resolution can take several seconds.

To drop the `:8080`:

```bash
sudo scripts/port80.sh install        # → http://term.localhost
sudo scripts/port80.sh install 8081   # if PORT is different
sudo scripts/port80.sh uninstall
```

A non-root process can't listen on port 80 of 127.0.0.1. The script therefore installs a
LaunchDaemon: launchd (as root) listens on port 80 of 127.0.0.1 and ::1, and for each connection
starts `nc` as your user, which relays it to the terminal. Nothing is opened on the network and
the server keeps its port. (pf doesn't work here: on macOS 26, its `rdr` rules don't apply to local
connections.)

## Extension: group terminal tabs

`extension/` automatically moves every terminal tab into a "Terminal" tab group (one per window),
including a terminal you reopen (`Cmd+Shift+T`) or one restored at startup. The same folder works
for both browsers. For Zen, use the mod below instead: don't install the extension in Zen, it
would create tab groups there.

- **Chrome**: `chrome://extensions` → Developer mode → *Load unpacked* → the `extension/` folder.
- **Firefox** (139 or later): `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* →
  `extension/manifest.json`. It goes away when Firefox closes; for a permanent install, sign it as
  unlisted on addons.mozilla.org
  (`npx web-ext sign --channel=unlisted --source-dir extension --api-key … --api-secret …`), then
  install the resulting `.xpi`.

**Shortcut**: `Alt+Shift+T` (Option+Shift+T on Mac) opens a terminal. From a terminal tab, the new
one opens in the same directory; otherwise at `http://term.localhost/` (configurable). To change
the key: *Change* button in the options, or `about:addons` → gear icon → *Manage Extension
Shortcuts* (Firefox), `chrome://extensions/shortcuts` (Chrome).

The extension options set the recognized addresses (by default `127.0.0.1:8080`,
`localhost:8080`, `term.localhost:8080` and `term.localhost`), and the group's name and color. A
tab you take out of the group yourself stays out; a tab that leaves the terminal for another site
leaves the group (can be turned off).

## Zen mod: one "Terminal" folder per space

`zen-mod/` is a mod for [Zen](https://zen-browser.app), loaded by the
[Sine](https://github.com/CosmoCreeper/Sine) mod manager. It moves every terminal tab into the
"Terminal" folder **of its space**, including the first terminal of an empty folder, and opens a
terminal from the keyboard. Unlike an extension, a mod has access to Zen's spaces and folders.

**Install**
1. Install Sine with its macOS installer (see Sine's releases page), then restart Zen. Sine adds
   two files to `Zen.app/Contents/Resources` (`config.js`, `defaults/pref/config-prefs.js`) and its
   engine to your profile. The terminal app you run the installer from needs permission to modify
   other apps first (see below).
2. Zen settings → *Sine Mods* → Sine settings: check *Enable installing JS from unofficial sources*
   (`sine.allow-unsafe-js` pref), since the mod isn't in the marketplace. A JS mod has full access
   to the browser: only install mods this way if you read their code.
3. Still in *Sine Mods*, install the mod from GitHub with the address of the repository's
   `zen-mod` folder (`https://github.com/TayzenDev/mywebterm/tree/main/zen-mod`).
4. Create a "Terminal" folder in each space where you want terminals to go, or check *Create the
   folder* in the mod settings.

**No *Sine Mods* section after installing?** macOS doesn't let an app modify another app's bundle
without permission, and the installer then fails silently: Sine lands in your profile, but not in
`Zen.app`. Check with `ls /Applications/Zen.app/Contents/Resources/config.js`. If the file is
missing:
1. System Settings → Privacy & Security → *App Management* (Sine's docs also mention *Full Disk
   Access*): turn it on for the terminal app you run the installer from (Terminal, Ghostty…).
2. Quit and reopen that terminal app, run Sine's installer again, then restart Zen.
3. Still nothing? `about:support` → *Clear Startup Cache*, and restart Zen once more.

**Settings** (*Sine Mods* → mywebterm, or `about:config`, `mywebterm.` prefix): folder name,
automatic folder creation, leaving the folder when the tab leaves the terminal, terminal
addresses, shortcut, address to open and reuse of the current directory. The shortcut is one or
more modifiers, then a letter or digit, joined with `+`: `Cmd`, `Ctrl`, `Alt` (Option on Mac),
`Shift`, e.g. `Cmd+Shift+T` (default `Alt+Shift+T`). It takes precedence over Zen's own shortcut on
the same keys. A tab you take out of the folder yourself isn't put back.

Zen pins the tabs in a folder, and normally unloads a pinned tab before it can be closed. The mod
skips that step for tabs in the terminal folder: they show a close button, and the close button,
`Cmd+W` and middle click close them right away. Other pinned tabs keep Zen's behavior.

**Publishing an update**: edit `zen-mod/`, bump `version` and set `updatedAt` in `theme.json` to
the current date and time, then push to GitHub. Sine copies the whole repository into the mod
folder, so the paths under `scripts` in `theme.json` start at the repository root (`zen-mod/…`).
Sine only updates a mod when `updatedAt` is newer
than the installed one; it checks when Zen starts (if auto-update is on for the mod in *Sine
Mods*) or on demand.

**Zen updates**: updates installed by Zen itself keep Sine's files (the updater only deletes the
files on its list and doesn't empty `defaults/pref/`). One exception: Zen prepares an update in a
copy of the app as soon as it is downloaded, and swaps it in at the next restart. If you install
Sine while an update is waiting, that restart removes Sine's files from the app: run Sine's
installer again once Zen is up to date. A full reinstall of Zen (new `.dmg`, Homebrew) also removes
them. Mods live in the profile and are always kept. To remove Sine from the app, delete those two
files.

## How it works

```
browser (ghostty-web)  ⇄  WebSocket /pty  ⇄  server.js (node-pty)  ⇄  zsh
```

- `public/index.html`: the ghostty-web terminal, which sends keystrokes and resizes.
- `server.js`: serves the page and the library, and connects each WebSocket to a real
  pseudo-terminal.
- `ghostty-config.js`: reads the Ghostty config and theme, served at `/config.json`.
- `fonts.js`: finds the files of an installed font family.
- `bin/title`, `bin/notify`: commands added to the shells' `PATH`, which rename the tab and send a
  notification.
- `bin/claude-notify-hook`: Claude Code hook that notifies the tab (see Notifications).
- `shell-integration/zsh/.zshenv`: reports the current directory to the page.

## Configuration

| Variable                    | Default     | Purpose                                                                         |
| --------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `PORT`                      | `8080`      | HTTP port                                                                       |
| `MYWEBTERM_HOST`            | `127.0.0.1` | Listening interface (not `HOST`: zsh uses that name for the machine's name)     |
| `SHELL`                     | `$SHELL`    | Shell to start                                                                  |
| `ALLOWED_HOSTS`             |             | Comma-separated names accepted besides `localhost`, `*.localhost` and 127.0.0.1 |
| `MYWEBTERM_UNSAFE_NO_TOKEN` |             | `1`: no access token (see Security). Refused unless listening on the loopback   |

## Security

This server gives full shell access to the machine.

- By default it only listens on `127.0.0.1`. Don't switch to `MYWEBTERM_HOST=0.0.0.0`: the token
  would then travel in clear over the network, and a leaked token gives a shell on your machine.
- The WebSocket requires the token from `~/.config/mywebterm/token`. The checks below only stop
  browsers: any other local process (another user, a Docker container reaching the host, a
  sandboxed app) can forge the headers, but can't read the token. The page keeps it in
  `localStorage`, which is per origin and port: other servers on localhost don't see it.
- `MYWEBTERM_UNSAFE_NO_TOKEN=1` turns the token off: no address to open first, but any local
  process can then open a shell as you. The Origin, Host and frame checks still apply to browsers.
- The page refuses to be shown in a frame (`frame-ancestors 'none'`): otherwise a site could load
  the terminal in an invisible iframe and make you type into it.
- WebSocket connections from another origin are rejected. Without this check, any site open in the
  browser could drive the terminal.
- They must also target a local name (`localhost`, `*.localhost`, 127.0.0.1 or `ALLOWED_HOSTS`):
  this blocks DNS rebinding, where a site points its own domain at 127.0.0.1.

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
