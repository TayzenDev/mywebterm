// mywebterm pour Zen : range chaque onglet du terminal dans le dossier « Terminal »
// de son espace et ouvre un terminal au clavier. Sine charge ce module dans
// chaque fenêtre de navigation (voir theme.json).

const PREFS = {
  // host[:port] tel qu'il apparaît dans l'URL, séparés par des virgules ;
  // « *.exemple » accepte les sous-domaines
  hosts: ['mywebterm.hosts', '127.0.0.1:8080, localhost:8080, term.localhost:8080, term.localhost'],
  folderName: ['mywebterm.folder-name', 'Terminal'],
  // Créer le dossier dans l'espace s'il n'existe pas ; sinon l'onglet reste où il est
  createFolder: ['mywebterm.create-folder', false],
  // Sortir du dossier un onglet rangé qui quitte le terminal pour un autre site
  leaveFolder: ['mywebterm.leave-folder', true],
  openUrl: ['mywebterm.open-url', 'http://term.localhost/'],
  // Depuis un terminal, le raccourci ouvre le nouveau dans le même dossier
  inheritCwd: ['mywebterm.inherit-cwd', true],
  shortcut: ['mywebterm.shortcut', 'Alt+Shift+T'],
};

function pref(key) {
  const [name, fallback] = PREFS[key];
  return typeof fallback === 'boolean'
    ? Services.prefs.getBoolPref(name, fallback)
    : Services.prefs.getStringPref(name, fallback).trim() || fallback;
}

// Marque, gardée par la restauration de session, des onglets rangés par le mod :
// un onglet sorti du dossier à la main n'y est pas remis, et seul un onglet rangé
// par le mod en ressort quand il quitte le terminal.
const PLACED = 'mywebterm-placed';

// Relu quand les réglages changent (readPrefs)
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
    // Épinglé : dans un dossier (Zen y épingle les onglets) ou parmi les Essentiels
    if (placed || tab.pinned) return;
    const folder = spaceFolder(tab);
    if (!folder) return;
    // Comme « Déplacer vers le dossier » de Zen, qui épingle l'onglet au passage
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

// Changement d'adresse d'un onglet, y compris par history.replaceState (dossier
// courant, ?title=…) : sans effet sur un onglet déjà rangé.
const progressListener = {
  onLocationChange(browser, webProgress) {
    if (webProgress.isTopLevel) onLocation(gBrowser.getTabForBrowser(browser));
  },
};

function openTerminal() {
  let url = pref('openUrl');
  const current = gBrowser.selectedBrowser.currentURI;
  // La page garde le dossier courant dans le chemin de l'URL ; on laisse le titre
  // et la commande en cours (?title=, ?c=)
  if (pref('inheritCwd') && isTerminal(current)) url = current.prePath + current.filePath;
  openTrustedLinkIn(url, 'tab');
}

// « Alt+Shift+T » → { code: 'KeyT', mods: Set { 'altKey', 'shiftKey' } }. On compare
// la touche physique (e.code) : avec Option sur Mac, e.key vaut « ˇ » et non « T ».
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
  if (!shortcut) console.warn(`[mywebterm] raccourci invalide : ${text}`);
}

function onKeyDown(event) {
  if (!shortcut || event.code !== shortcut.code) return;
  if (MODIFIER_KEYS.some((mod) => event[mod] !== shortcut.mods.has(mod))) return;
  event.preventDefault();
  event.stopPropagation();
  openTerminal();
}

// Réglages lus au démarrage, puis relus quand ils changent
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
  // Onglets déjà ouverts (restauration de session, mod activé en cours de route)
  for (const tab of gZenWorkspaces.allStoredTabs) onLocation(tab);
  // En phase de capture, avant les raccourcis de Zen et de la page
  window.addEventListener('keydown', onKeyDown, true);
}

// Désactivation du mod dans Sine, sans redémarrer (supportsUnload)
window.addUnloadListener?.(() => {
  gBrowser.removeTabsProgressListener(progressListener);
  Services.prefs.removeObserver(PREF_BRANCH, readPrefs);
  window.removeEventListener('keydown', onKeyDown, true);
});

init().catch((err) => console.error('[mywebterm]', err));
