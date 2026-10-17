// Range les onglets du terminal dans un groupe d'onglets « Terminal », un par
// fenêtre. Même code pour Firefox (page d'événements) et Chrome (service worker).
// Pour Zen, voir le mod zen-mod/.
// Chrome ne charge que ce fichier (service worker) ; Firefox charge defaults.js
// juste avant (manifest.json).
globalThis.importScripts?.('defaults.js');

function isTerminal(url, hosts) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return hosts.some((h) =>
    h.startsWith('*.') ? u.host.endsWith(h.slice(1)) : u.host === h,
  );
}

// Onglets déjà rangés. On ne les range qu'une fois : un onglet de terminal que
// l'utilisateur sort du groupe à la main y reste, même quand son URL change
// (?title=…). Vidé au redémarrage du navigateur, ce qui regroupe les onglets restaurés.
async function placedTabs() {
  const { placed = [] } = await api.storage.session.get('placed');
  return new Set(placed);
}

async function savePlaced(placed) {
  await api.storage.session.set({ placed: [...placed] });
}

async function terminalGroup(windowId, title) {
  const groups = await api.tabGroups.query({ windowId });
  return groups.find((g) => g.title === title);
}

async function groupTab(tab, s) {
  const group = await terminalGroup(tab.windowId, s.title);
  if (group) {
    if (tab.groupId !== group.id) await api.tabs.group({ groupId: group.id, tabIds: [tab.id] });
    return;
  }
  const groupId = await api.tabs.group({
    tabIds: [tab.id],
    createProperties: { windowId: tab.windowId },
  });
  await api.tabGroups.update(groupId, { title: s.title, color: s.color });
}

// Retourne true si `placed` a changé.
async function handleTab(tab, s, placed) {
  if (!tab.url) return false;
  if (isTerminal(tab.url, s.hosts)) {
    // Un onglet épinglé ne peut pas être groupé
    if (placed.has(tab.id) || tab.pinned) return false;
    await groupTab(tab, s);
    placed.add(tab.id);
    return true;
  }
  if (!placed.delete(tab.id)) return false;
  if (s.ungroupOnLeave && tab.groupId !== -1) {
    const group = await api.tabGroups.get(tab.groupId).catch(() => null);
    if (group?.title === s.title) await api.tabs.ungroup([tab.id]);
  }
  return true;
}

// Les événements arrivent en rafale (restauration de session, plusieurs onglets
// ouverts d'un coup) : on les traite un par un pour ne créer qu'un seul groupe.
let queue = Promise.resolve();
function serialize(fn) {
  queue = queue.then(fn).catch((err) => console.error('[mywebterm]', err));
  return queue;
}

// fresh : repartir de zéro (au démarrage, après un changement d'options)
function onTabs(getTabs, fresh = false) {
  return serialize(async () => {
    const [s, placed, tabs] = await Promise.all([
      api.storage.sync.get(DEFAULTS),
      fresh ? new Set() : placedTabs(),
      getTabs(),
    ]);
    let changed = fresh;
    for (const tab of tabs) {
      // Un onglet peut avoir été fermé entre l'événement et son traitement
      changed =
        (await handleTab(tab, s, placed).catch((err) => console.warn('[mywebterm]', err))) ||
        changed;
    }
    if (changed) await savePlaced(placed);
  });
}

function regroupAll() {
  return onTabs(() => api.tabs.query({}), true);
}

api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.pinned === false) onTabs(async () => [tab]);
});

api.tabs.onRemoved.addListener((tabId) => {
  serialize(async () => {
    const placed = await placedTabs();
    if (placed.delete(tabId)) await savePlaced(placed);
  });
});

api.runtime.onStartup.addListener(regroupAll);
api.runtime.onInstalled.addListener(regroupAll);

// Demandé par la page d'options après un enregistrement
api.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'regroup') return regroupAll().then(() => true);
});

// Raccourci clavier (modifiable dans les réglages du navigateur). La page garde
// le dossier courant dans le chemin de l'URL : depuis un terminal, on le reprend,
// sans le titre ni la commande en cours (?title=, ?c=).
async function openTerminal() {
  const s = await api.storage.sync.get(DEFAULTS);
  const [active] = await api.tabs.query({ active: true, lastFocusedWindow: true });
  let url = s.openUrl;
  if (s.inheritCwd && active?.url && isTerminal(active.url, s.hosts)) {
    const u = new URL(active.url);
    url = u.origin + u.pathname;
  }
  await api.tabs.create({ url, windowId: active?.windowId });
}

api.commands.onCommand.addListener((command) => {
  if (command === 'open-terminal') openTerminal();
});
