// Moves terminal tabs into a "Terminal" tab group, one per window. Same code
// for Firefox (event page) and Chrome (service worker). For Zen, see the
// zen-mod/ mod.
// Chrome only loads this file (service worker); Firefox loads defaults.js
// right before it (manifest.json).
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

// Tabs already grouped. Each is grouped only once: a terminal tab the user
// manually moves out of the group stays out, even when its URL changes
// (?title=…). Cleared on browser restart, which regroups restored tabs.
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

// Returns true if `placed` changed.
async function handleTab(tab, s, placed) {
  if (!tab.url) return false;
  if (isTerminal(tab.url, s.hosts)) {
    // A pinned tab cannot be grouped
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

// Events arrive in bursts (session restore, several tabs opened at once):
// handle them one at a time so only one group gets created.
let queue = Promise.resolve();
function serialize(fn) {
  queue = queue.then(fn).catch((err) => console.error('[mywebterm]', err));
  return queue;
}

// fresh: start over (on startup, after an options change)
function onTabs(getTabs, fresh = false) {
  return serialize(async () => {
    const [s, placed, tabs] = await Promise.all([
      api.storage.sync.get(DEFAULTS),
      fresh ? new Set() : placedTabs(),
      getTabs(),
    ]);
    let changed = fresh;
    for (const tab of tabs) {
      // A tab may have been closed between the event and its handling
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

// Requested by the options page after saving
api.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'regroup') return regroupAll().then(() => true);
});

// Keyboard shortcut (configurable in the browser settings). The page keeps the
// current directory in the URL path: from a terminal, reuse it, without the
// title or the running command (?title=, ?c=).
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
