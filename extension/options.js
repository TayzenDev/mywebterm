const $ = (id) => document.getElementById(id);

api.storage.sync.get(DEFAULTS).then((s) => {
  $('hosts').value = s.hosts.join('\n');
  $('title').value = s.title;
  $('color').value = s.color;
  $('ungroupOnLeave').checked = s.ungroupOnLeave;
  $('openUrl').value = s.openUrl;
  $('inheritCwd').checked = s.inheritCwd;
  $('agentCommand').value = s.agentCommand;
});
// The token gives access to a shell: not synced with the browser account
api.storage.local.get({ token: '' }).then((s) => ($('token').value = s.token));

async function showShortcuts() {
  const commands = await api.commands.getAll();
  for (const name of ['open-terminal', 'open-agent']) {
    const shortcut = commands.find((c) => c.name === name)?.shortcut;
    $(`shortcut-${name}`).textContent = shortcut || 'none';
  }
}
showShortcuts();
// Back from another tab (shortcut settings): refresh
document.addEventListener('visibilitychange', () => document.hidden || showShortcuts());

// Firefox has a dedicated page; Chrome, chrome://extensions/shortcuts
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
  const agentCommand = $('agentCommand').value.trim() || DEFAULTS.agentCommand;
  await api.storage.sync.set({
    hosts,
    title: $('title').value.trim() || DEFAULTS.title,
    color: $('color').value,
    ungroupOnLeave: $('ungroupOnLeave').checked,
    openUrl: $('openUrl').value.trim() || DEFAULTS.openUrl,
    inheritCwd: $('inheritCwd').checked,
    agentCommand,
  });
  await api.storage.local.set({ token: $('token').value.trim() });
  $('hosts').value = hosts.join('\n');
  $('agentCommand').value = agentCommand;
  await api.runtime.sendMessage({ type: 'regroup' });
  $('status').textContent = 'Saved.';
  setTimeout(() => ($('status').textContent = ''), 2000);
});
