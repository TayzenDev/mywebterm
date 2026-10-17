# Browser extension: group terminal tabs

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
