import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import pty from 'node-pty';
import { WebSocketServer } from 'ws';
import { loadGhosttyConfig } from './ghostty-config.js';
import { findFontFaces, fontFilePath } from './fonts.js';
import { iconSvg } from './icons.js';

// Not HOST: zsh and other environments use that name for the machine's
// hostname, which would expose the server on the network if it were exported
const HOST = process.env.MYWEBTERM_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 8080;
const SHELL = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PUBLIC_DIR = join(__dirname, 'public');
const BIN_DIR = join(__dirname, 'bin');
const ZSH_INTEGRATION_DIR = join(__dirname, 'shell-integration', 'zsh');
const GHOSTTY_DIR = join(dirname(require.resolve('ghostty-web')));

// On macOS, node-pty's spawn-helper binary sometimes loses its executable bit
// on install, which causes "posix_spawnp failed".
const spawnHelper = join(
  dirname(require.resolve('node-pty')),
  '..',
  'prebuilds',
  `${os.platform()}-${os.arch()}`,
  'spawn-helper',
);
if (existsSync(spawnHelper)) chmodSync(spawnHelper, 0o755);

// Secret required by /pty, created on first start, readable by you only. The
// Origin check below only stops browsers: any local process (another user, a
// container, a sandboxed app) can forge the headers, not guess the token.
// The page gets it once per address from #token=… and keeps it in
// localStorage, which is per origin and port and partitioned in iframes.
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(os.homedir(), '.config'), 'mywebterm');
const TOKEN_FILE = join(CONFIG_DIR, 'token');
function loadToken() {
  try {
    const token = readFileSync(TOKEN_FILE, 'utf8').trim();
    if (token) return token;
  } catch {
    // first start: create it
  }
  const token = randomBytes(32).toString('hex');
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
  return token;
}
// MYWEBTERM_UNSAFE_NO_TOKEN=1: no token, only the Origin and Host checks.
// Any local process can then open a shell. Only allowed on the loopback.
const NO_TOKEN = process.env.MYWEBTERM_UNSAFE_NO_TOKEN === '1';
if (NO_TOKEN && !['127.0.0.1', '::1', 'localhost'].includes(HOST)) {
  console.error(`MYWEBTERM_UNSAFE_NO_TOKEN refused with MYWEBTERM_HOST=${HOST}: anyone on the network would get a shell.`);
  process.exit(1);
}
const TOKEN = NO_TOKEN ? null : Buffer.from(loadToken());

function validToken(value) {
  if (NO_TOKEN) return true;
  const given = Buffer.from(value || '');
  return given.length === TOKEN.length && timingSafeEqual(given, TOKEN);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

// Ghostty config + files for the fonts requested by "font-family".
// A family with no usable file (e.g. a .ttc system font) has no faces: the
// page then asks the browser for it by name.
function pageConfig() {
  const { fontFamilies, ...config } = loadGhosttyConfig();
  const fonts = fontFamilies.map((family) => ({
    family,
    faces: findFontFaces(family).map(({ id, ...face }) => ({ ...face, url: `/fonts/${id}` })),
  }));
  return { home: os.homedir(), ...config, fonts };
}

// Static files: the lib under /ghostty-web/, installed fonts under
// /fonts/<id>, program favicons under /icons/<slug>.svg. Any other path is a
// directory to open: serve the page.
async function serveStatic(req, res) {
  // Same rule as the WebSocket (see isLocalName): through DNS rebinding, a
  // site could otherwise read /config.json (your home, so your user name)
  // and the font list
  if (!isLocalName(req.headers.host)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unknown host name: add it to ALLOWED_HOSTS.\n');
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  let file;
  if (url.pathname.startsWith('/ghostty-web/')) {
    file = normalize(join(GHOSTTY_DIR, url.pathname.slice('/ghostty-web'.length)));
    if (!file.startsWith(GHOSTTY_DIR)) {
      res.writeHead(403).end();
      return;
    }
  } else if (url.pathname.startsWith('/fonts/')) {
    // Only files found by findFontFaces, never an arbitrary path
    file = fontFilePath(Number(url.pathname.slice('/fonts/'.length)));
  } else if (url.pathname === '/config.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pageConfig()));
    return;
  } else if (url.pathname.startsWith('/icons/')) {
    const svg = iconSvg(url.pathname.slice('/icons/'.length).replace(/\.svg$/, ''));
    if (svg) res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(svg);
    else res.writeHead(404).end();
    return;
  } else if (url.pathname === '/favicon.ico') {
    res.writeHead(404).end();
    return;
  } else {
    servePage(req, res);
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

// Commands in the URL (?c=, ?command=) only run on their own when signed by
// the page with the token (?sig=): a link from another site or app can't
// forge one, so the page asks before running it.
// MYWEBTERM_UNSAFE_UNSIGNED_COMMANDS=1, or no token, falls back to the
// Sec-Fetch-Site header: run if the navigation comes from the user (address
// bar, bookmark, but also a link opened by another app: "none") or from the
// page itself, otherwise type it at the prompt without submitting it.
const SIGNED_COMMANDS = !NO_TOKEN && process.env.MYWEBTERM_UNSAFE_UNSIGNED_COMMANDS !== '1';

// The page, for any path that names a directory.
async function servePage(req, res) {
  const site = req.headers['sec-fetch-site'];
  const launch = SIGNED_COMMANDS ? 'signed' : site === 'none' || site === 'same-origin' ? 'run' : 'type';
  try {
    const html = await readFile(join(PUBLIC_DIR, 'index.html'), 'utf8');
    res.writeHead(200, {
      'Content-Type': MIME['.html'],
      'Cache-Control': 'no-store',
      // Never inside a frame: a site could load the terminal in an invisible
      // iframe and make you type into it (clickjacking)
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
    });
    res.end(html.replace('<html', `<html data-launch="${launch}"`));
  } catch {
    res.writeHead(404).end('Not found');
  }
}

// For zsh: ZDOTDIR points to shell-integration/zsh, whose .zshenv restores the
// user's config, then reports the current directory at each prompt.
// The .zshenv also puts the startup command in the input line of the first
// prompt (and submits it if run).
// secret: chosen by the page, it authenticates the sequences that announce
// the running command (see the .zshenv), which program output can't forge.
const IS_ZSH = SHELL.endsWith('/zsh');
// Environment passed to shells, without the version of the terminal that
// started the server (TERM_PROGRAM is replaced)
const { TERM_PROGRAM_VERSION: _, ...PARENT_ENV } = process.env;
function shellIntegrationEnv(command, run, secret) {
  if (!IS_ZSH) return {};
  const env = { ZDOTDIR: ZSH_INTEGRATION_DIR };
  if (secret) env.MYWEBTERM_SECRET = secret;
  if (process.env.ZDOTDIR !== undefined) env.MYWEBTERM_ZDOTDIR = process.env.ZDOTDIR;
  if (command) {
    env.MYWEBTERM_COMMAND = command;
    if (run) env.MYWEBTERM_COMMAND_RUN = '1';
  }
  return env;
}

// URL path → shell starting directory.
// "/~/Dev" and "/Users/me/Dev" are taken as is; "/Dev", which doesn't exist at
// the root, is looked up in the home. Returns null if nothing matches.
function resolveCwd(urlPath) {
  const home = os.homedir();
  const path = urlPath.replace(/\/+$/, '');
  if (path === '' || path === '/~') return home;
  const candidates = path.startsWith('/~/')
    ? [join(home, path.slice(3))]
    : [path, join(home, path)];
  for (const dir of candidates) {
    try {
      if (statSync(dir).isDirectory()) return dir;
    } catch {
      // doesn't exist, try the next one
    }
  }
  return null;
}

const server = createServer(serveStatic);

// Only accept connections from this page: otherwise any site open in the
// browser could connect to ws://localhost and run commands on the machine.
const wss = new WebSocketServer({
  server,
  path: '/pty',
  verifyClient: ({ req }) => {
    const origin = req.headers.origin;
    return isLocalName(req.headers.host) && origin === `http://${req.headers.host}`;
  },
});

// Names that refer to this machine: localhost, *.localhost (term.localhost…),
// loopback IPs and ALLOWED_HOSTS. Without this list, a site pointing its own
// domain to 127.0.0.1 ("DNS rebinding") would have an origin equal to its Host
// and would pass the check above.
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
function isLocalName(host = '') {
  const name = host.toLowerCase().replace(/:\d+$/, '');
  return name === 'localhost' || name.endsWith('.localhost')
    || name === '127.0.0.1' || name === '[::1]' || ALLOWED_HOSTS.includes(name);
}

// Image pasted into the page (the pty only carries text): saved to a temp
// directory, and its path is pasted instead. Claude Code and other agents
// recognize a pasted image path and attach it.
// One directory per shell, created on the first paste (mkdtemp: random name,
// readable by you only, so no other user can read or pre-create the files),
// removed when the shell closes or the server stops.
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const pasteDirs = new Set();
function pasteImage(shell, session, { mime, data, bracketed }) {
  const ext = IMAGE_EXT[mime];
  if (!ext || typeof data !== 'string') return;
  if (!session.pasteDir) {
    session.pasteDir = mkdtempSync(join(os.tmpdir(), 'mywebterm-paste-'));
    pasteDirs.add(session.pasteDir);
  }
  const file = join(session.pasteDir, `${Date.now()}.${ext}`);
  writeFileSync(file, Buffer.from(data, 'base64'), { mode: 0o600, flag: 'wx' });
  shell.write(bracketed ? `\x1b[200~${file}\x1b[201~` : file);
}

function removePasteDir(dir) {
  if (!dir) return;
  rmSync(dir, { recursive: true, force: true });
  pasteDirs.delete(dir);
}
process.on('exit', () => pasteDirs.forEach(removePasteDir));
// Without these handlers, Ctrl+C or a kill skips the "exit" event
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => process.exit(code));
}

// Window size in cells, sent by the page: a whole number, at most MAX_CELLS,
// otherwise the fallback. node-pty throws on 0, negative or NaN values (which
// would crash the server at spawn), and the kernel stores the size on 16 bits
// (70000 becomes 4464). The largest real case, an 8K or 32:9 screen 7680
// pixels wide, gives about 2100 columns with a 6px font, 7100 with the
// browser zoomed out to 30% on top: 10000 leaves room.
const MAX_CELLS = 10000;
function cells(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_CELLS) : fallback;
}

// Close code for a missing or wrong token: the page then asks for it again
const CLOSE_BAD_TOKEN = 4401;

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  if (!validToken(url.searchParams.get('token'))) {
    ws.close(CLOSE_BAD_TOKEN, 'invalid token');
    return;
  }
  const cols = cells(url.searchParams.get('cols'), 80);
  const rows = cells(url.searchParams.get('rows'), 24);
  // No control characters: the path is echoed back in the terminal
  const wanted = (url.searchParams.get('cwd') || '/').replace(/[\x00-\x1f\x7f]/g, '');
  const cwd = resolveCwd(wanted);
  // Startup command (the page's ?command=), on a single line
  const command = (url.searchParams.get('command') || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  const run = url.searchParams.get('run') === '1';
  const secret = url.searchParams.get('secret');
  if (!cwd) {
    ws.send(`\x1b[33mDirectory not found: ${wanted} — opening in home.\x1b[0m\r\n`);
  }

  // A failure (SHELL missing or not executable, spawn-helper…) would
  // otherwise crash the server and every open tab with it
  let shell;
  try {
    shell = pty.spawn(SHELL, ['-l'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || os.homedir(),
      env: {
        ...PARENT_ENV,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // Otherwise inherited from the terminal that started the server (e.g.
        // ghostty): AI agents would pick their sequences for that terminal
        TERM_PROGRAM: 'mywebterm',
        // Marker for bin/claude-notify-hook, which is declared for all terminals
        MYWEBTERM: '1',
        // Makes the `title` and `notify` commands available
        PATH: `${BIN_DIR}:${process.env.PATH}`,
        ...shellIntegrationEnv(command, run, /^[0-9a-f]{32}$/.test(secret) ? secret : ''),
      },
    });
  } catch (err) {
    console.error(`Could not start ${SHELL}: ${err.message}`);
    ws.send(`\x1b[31mCould not start ${SHELL}: ${err.message}\x1b[0m\r\n`);
    ws.close();
    return;
  }
  // Other shells: type it ahead, it will be read at the first prompt
  if (command && !IS_ZSH) shell.write(command + (run ? '\r' : ''));
  console.log(`[pty ${shell.pid}] ${SHELL} started in ${cwd || os.homedir()} (${cols}x${rows})`);

  // { pasteDir }: this shell's pasted images
  const session = {};

  shell.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  shell.onExit(({ exitCode }) => {
    console.log(`[pty ${shell.pid}] exited (code ${exitCode})`);
    ws.close();
  });

  // Browser messages: plain text = keystrokes,
  // JSON {type:"resize"} = resize, {type:"image"} = pasted image.
  ws.on('message', (raw) => {
    const msg = raw.toString();
    if (msg.startsWith('{')) {
      try {
        const ctrl = JSON.parse(msg);
        if (ctrl.type === 'resize') {
          shell.resize(cells(ctrl.cols, shell.cols), cells(ctrl.rows, shell.rows));
          return;
        }
        if (ctrl.type === 'image') {
          pasteImage(shell, session, ctrl);
          return;
        }
      } catch {
        // not JSON: treat it as normal input
      }
    }
    shell.write(msg);
  });

  ws.on('close', () => {
    shell.kill();
    removePasteDir(session.pasteDir);
  });
});

server.listen(PORT, HOST, () => {
  const address = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  if (NO_TOKEN) {
    console.log(`Terminal available at ${address}`);
    console.warn('UNSAFE: no token (MYWEBTERM_UNSAFE_NO_TOKEN=1), any local process can open a shell.');
    console.warn('UNSAFE: commands in the URL are not signed, links from other apps run them.');
    return;
  }
  console.log(`Terminal available at ${address}/#token=${TOKEN}`);
  console.log(`(token in ${TOKEN_FILE}, asked once per address)`);
  if (!SIGNED_COMMANDS) {
    console.warn('UNSAFE: commands in the URL are not signed (MYWEBTERM_UNSAFE_UNSIGNED_COMMANDS=1), links from other apps run them.');
  }
});

// Browsers also resolve localhost and *.localhost (term.localhost) to ::1,
// sometimes first: so also listen on the IPv6 loopback, handing connections to
// the same server.
if (HOST === '127.0.0.1') {
  createNetServer((socket) => server.emit('connection', socket))
    .on('error', (err) => console.warn(`Not listening on [::1]:${PORT} (${err.code})`))
    .listen(PORT, '::1');
}
