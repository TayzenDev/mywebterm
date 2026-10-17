const $ = (id) => document.getElementById(id);

api.storage.sync.get(DEFAULTS).then((s) => {
  $('hosts').value = s.hosts.join('\n');
  $('title').value = s.title;
  $('color').value = s.color;
  $('ungroupOnLeave').checked = s.ungroupOnLeave;
  $('openUrl').value = s.openUrl;
  $('inheritCwd').checked = s.inheritCwd;
});

async function showShortcut() {
  const commands = await api.commands.getAll();
  const shortcut = commands.find((c) => c.name === 'open-terminal')?.shortcut;
  $('shortcut').textContent = shortcut || 'aucun';
}
showShortcut();
// Revient d'un autre onglet (réglage des raccourcis) : on rafraîchit
document.addEventListener('visibilitychange', () => document.hidden || showShortcut());

// Firefox a une page dédiée ; Chrome, chrome://extensions/shortcuts
$('editShortcut').addEventListener('click', () => {
  if (api.commands.openShortcutSettings) api.commands.openShortcutSettings();
  else api.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const hosts = $('hosts').value
    .split('\n')
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  await api.storage.sync.set({
    hosts,
    title: $('title').value.trim() || DEFAULTS.title,
    color: $('color').value,
    ungroupOnLeave: $('ungroupOnLeave').checked,
    openUrl: $('openUrl').value.trim() || DEFAULTS.openUrl,
    inheritCwd: $('inheritCwd').checked,
  });
  $('hosts').value = hosts.join('\n');
  await api.runtime.sendMessage({ type: 'regroup' });
  $('status').textContent = 'Enregistré.';
  setTimeout(() => ($('status').textContent = ''), 2000);
});
