// mywebterm for Zen: moves each terminal tab into the "Terminal" folder of its
// space and opens a terminal from the keyboard. Sine loads this module in
// every browser window (see theme.json).

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

function openTerminal() {
  let url = pref('openUrl');
  const current = gBrowser.selectedBrowser.currentURI;
  // The page keeps the current directory in the URL path; drop the title and
  // the running command (?title=, ?c=)
  if (pref('inheritCwd') && isTerminal(current)) url = current.prePath + current.filePath;
  openTrustedLinkIn(url, 'tab');
}

// `Alt+Shift+T` → { code: 'KeyT', mods: Set { 'altKey', 'shiftKey' } }. Compare the
// physical key (e.code): with Option on Mac, e.key is `ˇ`, not `T`.
const MODIFIERS = { alt: 'altKey', option: 'altKey', shift: 'shiftKey', ctrl: 'ctrlKey', control: 'ctrlKey', cmd: 'metaKey', command: 'metaKey', meta: 'metaKey' };
const MODIFIER_KEYS = ['altKey', 'shiftKey', 'ctrlKey', 'metaKey'];

function parseShortcut(text) {
  const parts = text.split('+').map((p) => p.trim().toLowerCase());
  const key = parts.pop();
  let code = null;
  if (/^[a-z]$/.test(key)) code = `Key${key.toUpperCase()}`;
  else if (/^[0-9]$/.test(key)) code = `Digit${key}`;
  const mods = parts.map((p) => MODIFIERS[p]);
  if (!code || !mods.length || mods.includes(undefined)) return null;
  return { code, mods: new Set(mods) };
}

let shortcut = null;
function readShortcut() {
  const text = pref('shortcut');
  shortcut = parseShortcut(text);
  if (!shortcut) console.warn(`[mywebterm] invalid shortcut: ${text}`);
}

function onKeyDown(event) {
  if (!shortcut || event.code !== shortcut.code) return;
  if (MODIFIER_KEYS.some((mod) => event[mod] !== shortcut.mods.has(mod))) return;
  event.preventDefault();
  event.stopPropagation();
  openTerminal();
}

// Prefs read on startup, then reread when they change
const PREF_BRANCH = 'mywebterm.';
function readPrefs() {
  readHosts();
  readShortcut();
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
}

// Mod disabled in Sine, without a restart (supportsUnload)
window.addUnloadListener?.(() => {
  gBrowser.removeTabsProgressListener(progressListener);
  Services.prefs.removeObserver(PREF_BRANCH, readPrefs);
  window.removeEventListener('keydown', onKeyDown, true);
});

init().catch((err) => console.error('[mywebterm]', err));
