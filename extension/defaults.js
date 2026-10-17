// Default settings, shared by the background script and the options page.
const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  // host[:port] as it appears in the URL; `*.example` matches subdomains
  hosts: ['127.0.0.1:8080', 'localhost:8080', 'term.localhost:8080', 'term.localhost'],
  title: 'Terminal',
  color: 'grey',
  // Ungroup a tab that leaves the terminal for another site
  ungroupOnLeave: true,
  // Address opened by the keyboard shortcut
  openUrl: 'http://term.localhost/',
  // From a terminal, the shortcut opens the new one in the same directory
  inheritCwd: true,
};
