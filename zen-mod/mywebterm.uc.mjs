// mywebterm for Zen: moves each terminal tab into the "Terminal" folder of its
// space, closes those tabs in one step and opens a terminal or an AI agent
// from the keyboard.
// Sine loads this module in every browser window (see theme.json).

const PREFS = {
  // host[:port] as it appears in the URL, comma-separated;
  // `*.example` matches subdomains
  hosts: ['mywebterm.hosts', '127.0.0.1:8080, localhost:8080, term.localhost:8080, term.localhost'],
  folderName: ['mywebterm.folder-name', 'Terminal'],
  // Create the folder in the space if missing; otherwise the tab stays where it is
  createFolder: ['mywebterm.create-folder', false],
  // Move a placed tab out of the folder when it leaves the terminal for another site
  leaveFolder: ['mywebterm.leave-folder', true],
  openUrl: ['mywebterm.open-url', 'http://term.localhost/'],
  // From a terminal, the shortcut opens the new one in the same directory
  inheritCwd: ['mywebterm.inherit-cwd', true],
  shortcut: ['mywebterm.shortcut', 'Alt+Shift+T'],
  // Opens a terminal that runs agentCommand
  agentShortcut: ['mywebterm.agent-shortcut', 'Alt+Shift+A'],
  agentCommand: ['mywebterm.agent-command', 'claude'],
};

function pref(key) {
  const [name, fallback] = PREFS[key];
  return typeof fallback === 'boolean'
    ? Services.prefs.getBoolPref(name, fallback)
    : Services.prefs.getStringPref(name, fallback).trim() || fallback;
}

// Marker, kept by session restore, on tabs placed by the mod: a tab manually
// moved out of the folder is not put back, and only a tab placed by the mod
// is moved out when it leaves the terminal.
const PLACED = 'mywebterm-placed';

// Reread when the prefs change (readPrefs)
let hosts = [];
function readHosts() {
  hosts = pref('hosts')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function isTerminal(uri) {
  if (!uri?.schemeIs('http') && !uri?.schemeIs('https')) return false;
  const host = uri.hostPort.toLowerCase();
  return hosts.some((h) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) : host === h));
}

function spaceFolder(tab) {
  const space = tab.getAttribute('zen-workspace-id') || gZenWorkspaces.activeWorkspace;
  const label = pref('folderName');
  const folder = gBrowser.tabGroups.find(
    (g) =>
      g.isZenFolder &&
      !g.isLiveFolder &&
      g.label === label &&
      g.getAttribute('zen-workspace-id') === space,
  );
  if (folder || !pref('createFolder')) return folder;
  return gZenFolders.createFolder([], { workspaceId: space, label });
}

// Zen unloads a pinned tab before it can be closed, and every tab in a folder
// is pinned. Tabs in the terminal folder close in one step instead; this
// attribute lets chrome.css show their close button.
const IN_FOLDER = 'mywebterm-in-folder';

function inTerminalFolder(tab) {
  return Boolean(tab?.group?.isZenFolder && tab.group.label === pref('folderName'));
}

function markTab(tab) {
  tab.toggleAttribute(IN_FOLDER, inTerminalFolder(tab));
}

// TabGrouped / TabUngrouped carry the tab in event.detail
function onGroupChange(event) {
  markTab(event.detail);
}

// Middle click on a pinned tab goes through Zen's onCloseTabShortcut, replaced
// in init()
let zenCloseTabShortcut;
function closeTabShortcut(event, selectedTab = gBrowser.selectedTab, options = {}) {
  if ([selectedTab].flat().every(inTerminalFolder)) options = { ...options, behavior: 'close' };
  return zenCloseTabShortcut.call(this, event, selectedTab, options);
}

// Cmd+W: Zen listens to cmd_close with a copy of onCloseTabShortcut bound at
// startup, which the override above doesn't reach. Close terminal tabs first.
function onCommand(event) {
  if (event.target.id !== 'cmd_close') return;
  const tabs = gBrowser.selectedTab.multiselected ? gBrowser.selectedTabs : [gBrowser.selectedTab];
  if (!tabs.every(inTerminalFolder)) return;
  event.stopImmediatePropagation();
  event.preventDefault();
  gBrowser.removeTabs(tabs, { animate: true });
}

function onLocation(tab) {
  if (!tab || tab.hasAttribute('zen-empty-tab')) return;
  const placed = SessionStore.getCustomTabValue(tab, PLACED) === '1';
  if (isTerminal(tab.linkedBrowser?.currentURI)) {
    // Pinned: in a folder (Zen pins tabs there) or among the Essentials
    if (placed || tab.pinned) return;
    const folder = spaceFolder(tab);
    if (!folder) return;
    // Like Zen's "Move to folder", which pins the tab along the way
    folder.addTabs([tab]);
    SessionStore.setCustomTabValue(tab, PLACED, '1');
  } else if (placed) {
    SessionStore.deleteCustomTabValue(tab, PLACED);
    if (pref('leaveFolder') && tab.group?.isZenFolder) {
      gBrowser.ungroupTab(tab);
      gBrowser.unpinTab(tab);
    }
  }
}

// A tab's address changes, including through history.replaceState (current
// directory, ?title=…): no effect on a tab already placed.
const progressListener = {
  onLocationChange(browser, webProgress) {
    if (webProgress.isTopLevel) onLocation(gBrowser.getTabForBrowser(browser));
  },
};

async function openTerminal(command) {
  let url = pref('openUrl');
  const current = gBrowser.selectedBrowser.currentURI;
  // The page keeps the current directory in the URL path; drop the title and
  // the running command (?title=, ?c=)
  if (pref('inheritCwd') && isTerminal(current)) url = current.prePath + current.filePath;
  if (command) url = await commandUrl(url, command);
  openTrustedLinkIn(url, 'tab');
}

// Adds the command (?c=) to the address, signed with the server's token (see
// "Signed commands" in public/index.html): without a signature, the page asks
// before running it.
async function commandUrl(url, command) {
  const u = new URL(url);
  u.searchParams.set('c', command);
  const token = await readToken();
  if (token) u.searchParams.set('sig', await signCommand(token, u.pathname, command));
  return u.href;
}

// Read at each use: the server creates it again if it's deleted
async function readToken() {
  const configHome = Services.env.get('XDG_CONFIG_HOME') || PathUtils.join(Services.dirsvc.get('Home', Ci.nsIFile).path, '.config');
  try {
    return (await IOUtils.readUTF8(PathUtils.join(configHome, 'mywebterm', 'token'))).trim();
  } catch {
    return '';
  }
}

async function signCommand(token, path, command) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`mywebterm-command\n${path}\n${command}`));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// `Alt+Shift+T` → { keyCode: 84, mods: Set { 'altKey', 'shiftKey' } }. Compare
// e.keyCode, the key's letter or digit in the current layout: with Option on
// Mac, e.key is `ˇ`, not `T`, and e.code is the physical key (`KeyQ` for the A
// of an AZERTY keyboard).
const MODIFIERS = { alt: 'altKey', option: 'altKey', shift: 'shiftKey', ctrl: 'ctrlKey', control: 'ctrlKey', cmd: 'metaKey', command: 'metaKey', meta: 'metaKey' };
const MODIFIER_KEYS = ['altKey', 'shiftKey', 'ctrlKey', 'metaKey'];

function parseShortcut(text) {
  const parts = text.split('+').map((p) => p.trim().toLowerCase());
  const key = parts.pop();
  const keyCode = /^[a-z0-9]$/.test(key) ? key.toUpperCase().charCodeAt(0) : null;
  const mods = parts.map((p) => MODIFIERS[p]);
  if (!keyCode || !mods.length || mods.includes(undefined)) return null;
  return { keyCode, mods: new Set(mods) };
}

// [shortcut, action]…
let shortcuts = [];
function readShortcuts() {
  shortcuts = [
    ['shortcut', () => openTerminal()],
    ['agentShortcut', () => openTerminal(pref('agentCommand'))],
  ].flatMap(([key, action]) => {
    const text = pref(key);
    const shortcut = parseShortcut(text);
    if (!shortcut) console.warn(`[mywebterm] invalid shortcut: ${text}`);
    return shortcut ? [[shortcut, action]] : [];
  });
}

function onKeyDown(event) {
  const match = shortcuts.find(
    ([shortcut]) =>
      event.keyCode === shortcut.keyCode && MODIFIER_KEYS.every((mod) => event[mod] === shortcut.mods.has(mod)),
  );
  if (!match) return;
  event.preventDefault();
  event.stopPropagation();
  match[1]().catch((err) => console.error('[mywebterm]', err));
}

// Prefs read on startup, then reread when they change
const PREF_BRANCH = 'mywebterm.';
function readPrefs() {
  readHosts();
  readShortcuts();
  // The folder name may have changed
  for (const tab of gZenWorkspaces.allStoredTabs) markTab(tab);
}

async function init() {
  await delayedStartupPromise;
  await gZenWorkspaces.promiseInitialized;
  readPrefs();
  Services.prefs.addObserver(PREF_BRANCH, readPrefs);
  gBrowser.addTabsProgressListener(progressListener);
  // Tabs already open (session restore, mod enabled mid-session)
  for (const tab of gZenWorkspaces.allStoredTabs) onLocation(tab);
  // In the capture phase, before Zen's and the page's shortcuts
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('command', onCommand, true);
  window.addEventListener('TabGrouped', onGroupChange);
  window.addEventListener('TabUngrouped', onGroupChange);
  zenCloseTabShortcut = gZenPinnedTabManager.onCloseTabShortcut;
  gZenPinnedTabManager.onCloseTabShortcut = closeTabShortcut;
}

// Mod disabled in Sine, without a restart (supportsUnload)
window.addUnloadListener?.(() => {
  gBrowser.removeTabsProgressListener(progressListener);
  Services.prefs.removeObserver(PREF_BRANCH, readPrefs);
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('command', onCommand, true);
  window.removeEventListener('TabGrouped', onGroupChange);
  window.removeEventListener('TabUngrouped', onGroupChange);
  if (zenCloseTabShortcut) gZenPinnedTabManager.onCloseTabShortcut = zenCloseTabShortcut;
  for (const tab of gZenWorkspaces.allStoredTabs) tab.removeAttribute(IN_FOLDER);
});

init().catch((err) => console.error('[mywebterm]', err));
