// Recherche des fichiers de police installés à partir d'un nom de famille,
// comme le fait Ghostty pour « font-family ».
import { closeSync, openSync, readdirSync, readSync } from 'node:fs';
import { extname, join } from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const FONT_DIRS = [
  join(HOME, 'Library', 'Fonts'),
  '/Library/Fonts',
  '/System/Library/Fonts',
  join(HOME, '.local', 'share', 'fonts'),
  join(HOME, '.fonts'),
  '/usr/share/fonts',
  '/usr/local/share/fonts',
];

// Seuls les fichiers simples sont lisibles par les navigateurs (pas les .ttc)
const FORMATS = { '.ttf': 'truetype', '.otf': 'opentype' };

function read(fd, position, length) {
  const buf = Buffer.alloc(length);
  readSync(fd, buf, 0, length, position);
  return buf;
}

function decodeName(buf, platformId) {
  if (platformId === 1) return buf.toString('latin1');
  return Buffer.from(buf).swap16().toString('utf16le');
}

// Lit les tables « name » et « OS/2 » d'un fichier TrueType/OpenType :
// noms de famille, graisse et italique.
function readFace(file) {
  const fd = openSync(file, 'r');
  try {
    const numTables = read(fd, 4, 2).readUInt16BE(0);
    const dir = read(fd, 12, numTables * 16);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const tag = dir.toString('latin1', i * 16, i * 16 + 4);
      tables[tag] = { offset: dir.readUInt32BE(i * 16 + 8), length: dir.readUInt32BE(i * 16 + 12) };
    }
    if (!tables.name) return null;

    const name = read(fd, tables.name.offset, tables.name.length);
    const count = name.readUInt16BE(2);
    const stringOffset = name.readUInt16BE(4);
    // nameID 1 = famille, 16 = famille typographique (regroupe Light, Medium…)
    const families = new Set();
    for (let i = 0; i < count; i++) {
      const rec = 6 + i * 12;
      const platformId = name.readUInt16BE(rec);
      const nameId = name.readUInt16BE(rec + 6);
      if ((nameId !== 1 && nameId !== 16) || (platformId !== 1 && platformId !== 3)) continue;
      const length = name.readUInt16BE(rec + 8);
      const start = stringOffset + name.readUInt16BE(rec + 10);
      families.add(decodeName(name.subarray(start, start + length), platformId).toLowerCase());
    }

    let weight = 400;
    let italic = false;
    if (tables['OS/2']) {
      const os2 = read(fd, tables['OS/2'].offset, 64);
      weight = os2.readUInt16BE(4);
      italic = (os2.readUInt16BE(62) & 1) === 1;
    }
    return { families, weight, style: italic ? 'italic' : 'normal' };
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

let index = null;

function buildIndex() {
  const faces = [];
  for (const dir of FONT_DIRS) {
    let names;
    try {
      names = readdirSync(dir, { recursive: true });
    } catch {
      continue;
    }
    for (const name of names) {
      const format = FORMATS[extname(name).toLowerCase()];
      if (!format) continue;
      const path = join(dir, name);
      const face = readFace(path);
      if (face) faces.push({ ...face, path, format });
    }
  }
  return faces;
}

function facesFor(family) {
  const wanted = family.toLowerCase();
  return index.flatMap((face, id) => (face.families.has(wanted) ? [{ ...face, id }] : []));
}

// Variantes installées d'une famille ; l'index est reconstruit si la famille
// est introuvable (police installée depuis le démarrage du serveur).
export function findFontFaces(family) {
  index ??= buildIndex();
  let faces = facesFor(family);
  if (!faces.length) {
    index = buildIndex();
    faces = facesFor(family);
  }
  return faces.map(({ id, weight, style, format }) => ({ id, weight, style, format }));
}

// Chemin du fichier d'une variante renvoyée par findFontFaces
export function fontFilePath(id) {
  return index?.[id]?.path;
}
