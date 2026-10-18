# Zen mod: one "Terminal" folder per space

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
addresses, shortcut, address to open, reuse of the current directory, AI agent shortcut and
command. A shortcut is one or more modifiers, then a letter or digit, joined with `+`: `Cmd`,
`Ctrl`, `Alt` (Option on Mac), `Shift`, e.g. `Cmd+Shift+T` (default `Alt+Shift+T`). It takes
precedence over Zen's own shortcut on the same keys. A tab you take out of the folder yourself
isn't put back.

The AI agent shortcut (default `Alt+Shift+A`) opens a terminal like the other one, which runs the
AI agent command (default `claude`). The mod signs that command with the server's token, read from
`~/.config/mywebterm/token` (see [URLs](urls.md#run-a-command)), so it runs without asking.

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
