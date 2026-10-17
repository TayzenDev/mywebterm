import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { chmodSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import pty from 'node-pty';
import { WebSocketServer } from 'ws';
import { loadGhosttyConfig } from './ghostty-config.js';
import { findFontFaces, fontFilePath } from './fonts.js';
import { iconSvg } from './icons.js';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 8080;
const SHELL = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PUBLIC_DIR = join(__dirname, 'public');
const BIN_DIR = join(__dirname, 'bin');
const ZSH_INTEGRATION_DIR = join(__dirname, 'shell-integration', 'zsh');
const GHOSTTY_DIR = join(dirname(require.resolve('ghostty-web')));

// Sur macOS, le binaire spawn-helper de node-pty perd parfois son bit exécutable
// à l'installation, ce qui provoque « posix_spawnp failed ».
const spawnHelper = join(
  dirname(require.resolve('node-pty')),
  '..',
  'prebuilds',
  `${os.platform()}-${os.arch()}`,
  'spawn-helper',
);
if (existsSync(spawnHelper)) chmodSync(spawnHelper, 0o755);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

// Config Ghostty + fichiers des polices demandées par « font-family ».
// Une famille sans fichier exploitable (ex. police système en .ttc) n'a pas de
// faces : la page la demande alors au navigateur par son nom.
function pageConfig() {
  const { fontFamilies, ...config } = loadGhosttyConfig();
  const fonts = fontFamilies.map((family) => ({
    family,
    faces: findFontFaces(family).map(({ id, ...face }) => ({ ...face, url: `/fonts/${id}` })),
  }));
  return { home: os.homedir(), ...config, fonts };
}

// Fichiers statiques : la lib sous /ghostty-web/, les polices installées sous
// /fonts/<id>, les favicons de programmes sous /icons/<slug>.svg. Tout autre
// chemin est un dossier à ouvrir : on renvoie la page.
async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let file;
  if (url.pathname.startsWith('/ghostty-web/')) {
    file = normalize(join(GHOSTTY_DIR, url.pathname.slice('/ghostty-web'.length)));
    if (!file.startsWith(GHOSTTY_DIR)) {
      res.writeHead(403).end();
      return;
    }
  } else if (url.pathname.startsWith('/fonts/')) {
    // Uniquement les fichiers trouvés par findFontFaces, jamais un chemin libre
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

// La page, pour tout chemin qui désigne un dossier. Un lien sur un autre site
// peut ouvrir http://localhost:8080/?command=… : la commande n'est lancée
// d'office que si la navigation vient de l'utilisateur (barre d'adresse,
// favori : « none ») ou de la page elle-même. Sinon la page se contente de la
// taper au prompt, sans la valider.
async function servePage(req, res) {
  const site = req.headers['sec-fetch-site'];
  const launch = site === 'none' || site === 'same-origin' ? 'run' : 'type';
  try {
    const html = await readFile(join(PUBLIC_DIR, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    res.end(html.replace('<html lang="fr">', `<html lang="fr" data-launch="${launch}">`));
  } catch {
    res.writeHead(404).end('Not found');
  }
}

// Pour zsh : ZDOTDIR pointe vers shell-integration/zsh, dont le .zshenv restaure
// la config de l'utilisateur puis signale le dossier courant à chaque prompt.
// Le .zshenv place aussi la commande de départ dans la ligne de saisie du
// premier prompt (et la valide si run).
const IS_ZSH = SHELL.endsWith('/zsh');
// Environnement transmis aux shells, sans la version du terminal qui a lancé
// le serveur (TERM_PROGRAM est remplacé)
const { TERM_PROGRAM_VERSION: _, ...PARENT_ENV } = process.env;
function shellIntegrationEnv(command, run) {
  if (!IS_ZSH) return {};
  const env = { ZDOTDIR: ZSH_INTEGRATION_DIR };
  if (process.env.ZDOTDIR !== undefined) env.MYWEBTERM_ZDOTDIR = process.env.ZDOTDIR;
  if (command) {
    env.MYWEBTERM_COMMAND = command;
    if (run) env.MYWEBTERM_COMMAND_RUN = '1';
  }
  return env;
}

// Chemin de l'URL → dossier de départ du shell.
// « /~/Dev » et « /Users/moi/Dev » sont pris tels quels ; « /Dev » qui n'existe pas
// à la racine est cherché dans le home. Retourne null si rien ne correspond.
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
      // n'existe pas, on essaie le suivant
    }
  }
  return null;
}

const server = createServer(serveStatic);

// N'accepte que les connexions venant de cette page : sans ça, n'importe quel
// site ouvert dans le navigateur pourrait se connecter à ws://localhost et
// exécuter des commandes sur la machine.
const wss = new WebSocketServer({
  server,
  path: '/pty',
  verifyClient: ({ req }) => {
    const origin = req.headers.origin;
    return isLocalName(req.headers.host) && origin === `http://${req.headers.host}`;
  },
});

// Noms qui désignent cette machine : localhost, *.localhost (term.localhost…),
// les IP de loopback et ALLOWED_HOSTS. Sans cette liste, un site qui fait
// pointer son propre domaine vers 127.0.0.1 (« DNS rebinding ») aurait une
// origine égale à son Host et passerait le contrôle ci-dessus.
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
function isLocalName(host = '') {
  const name = host.toLowerCase().replace(/:\d+$/, '');
  return name === 'localhost' || name.endsWith('.localhost')
    || name === '127.0.0.1' || name === '[::1]' || ALLOWED_HOSTS.includes(name);
}

// Image collée dans la page (le pty ne transporte que du texte) : enregistrée
// dans le dossier temporaire, son chemin est collé à la place. Claude Code et
// les autres agents reconnaissent un chemin d'image collé et l'attachent.
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
function pasteImage(shell, { mime, data, bracketed }) {
  const ext = IMAGE_EXT[mime];
  if (!ext || typeof data !== 'string') return;
  const file = join(os.tmpdir(), `mywebterm-paste-${Date.now()}.${ext}`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  shell.write(bracketed ? `\x1b[200~${file}\x1b[201~` : file);
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const cols = Number(url.searchParams.get('cols')) || 80;
  const rows = Number(url.searchParams.get('rows')) || 24;
  // Sans caractères de contrôle : le chemin est réaffiché dans le terminal
  const wanted = (url.searchParams.get('cwd') || '/').replace(/[\x00-\x1f\x7f]/g, '');
  const cwd = resolveCwd(wanted);
  // Commande de départ (?command= de la page), sur une ligne
  const command = (url.searchParams.get('command') || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  const run = url.searchParams.get('run') === '1';
  if (!cwd) {
    ws.send(`\x1b[33mDossier introuvable : ${wanted} — ouverture dans le home.\x1b[0m\r\n`);
  }

  const shell = pty.spawn(SHELL, ['-l'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || os.homedir(),
    env: {
      ...PARENT_ENV,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      // Sinon hérité du terminal qui a lancé le serveur (ex. ghostty) : les
      // agents IA choisiraient leurs séquences pour ce terminal-là
      TERM_PROGRAM: 'mywebterm',
      // Repère pour bin/claude-notify-hook, déclaré pour tous les terminaux
      MYWEBTERM: '1',
      // Donne accès aux commandes `title` et `notify`
      PATH: `${BIN_DIR}:${process.env.PATH}`,
      ...shellIntegrationEnv(command, run),
    },
  });
  // Autres shells : on la tape d'avance, elle sera lue au premier prompt
  if (command && !IS_ZSH) shell.write(command + (run ? '\r' : ''));
  console.log(`[pty ${shell.pid}] ${SHELL} démarré dans ${cwd || os.homedir()} (${cols}x${rows})`);

  shell.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  shell.onExit(({ exitCode }) => {
    console.log(`[pty ${shell.pid}] terminé (code ${exitCode})`);
    ws.close();
  });

  // Messages du navigateur : texte brut = frappes clavier,
  // JSON {type:"resize"} = redimensionnement, {type:"image"} = image collée.
  ws.on('message', (raw) => {
    const msg = raw.toString();
    if (msg.startsWith('{')) {
      try {
        const ctrl = JSON.parse(msg);
        if (ctrl.type === 'resize') {
          shell.resize(ctrl.cols, ctrl.rows);
          return;
        }
        if (ctrl.type === 'image') {
          pasteImage(shell, ctrl);
          return;
        }
      } catch {
        // pas du JSON : on le traite comme une saisie normale
      }
    }
    shell.write(msg);
  });

  ws.on('close', () => shell.kill());
});

server.listen(PORT, HOST, () => {
  console.log(`Terminal disponible sur http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

// Les navigateurs résolvent localhost et *.localhost (term.localhost) aussi en ::1,
// parfois en premier : on écoute donc également sur la loopback IPv6, en passant
// les connexions au même serveur.
if (HOST === '127.0.0.1') {
  createNetServer((socket) => server.emit('connection', socket))
    .on('error', (err) => console.warn(`Pas d'écoute sur [::1]:${PORT} (${err.code})`))
    .listen(PORT, '::1');
}
