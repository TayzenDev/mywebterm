# In the terminal

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

## Text size

`Cmd` (or `Ctrl`) with `+` / `-` makes the text larger or smaller, `0` goes back to the configured
`font-size`. The keys are matched on the typed character, so they work without Shift on QWERTY,
AZERTY and QWERTZ. The size (6 to 72 px) shows next to the title for a moment, and is kept for the
tab: a reload keeps it, a new terminal starts at the configured size.

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
  in a temporary directory readable by you only
  (`$TMPDIR/mywebterm-paste-<random>/tab-<random>/<date>.png`) and pastes its path. The tab's
  directory is removed when its shell ends, the whole tree when the server stops. Claude Code
  recognizes a pasted image path and attaches it.
- **Ctrl+V** (macOS): forwarded to the program, as in Ghostty. Claude Code then reads the Mac
  clipboard itself.

Both assume the program runs on this Mac: through `ssh`, the path points to a file that doesn't
exist on the remote machine, and Ctrl+V reads a different clipboard.
