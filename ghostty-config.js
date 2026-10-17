// Reads the Ghostty config to reuse its look in the browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const XDG_CONFIG = process.env.XDG_CONFIG_HOME || join(HOME, '.config');

const CONFIG_FILES = [
  join(XDG_CONFIG, 'ghostty', 'config'),
  join(HOME, 'Library', 'Application Support', 'com.mitchellh.ghostty', 'config'),
];

const THEME_DIRS = [
  join(XDG_CONFIG, 'ghostty', 'themes'),
  '/Applications/Ghostty.app/Contents/Resources/ghostty/themes',
];

// Ghostty palette index → xterm.js / ghostty-web color name
const PALETTE_NAMES = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];

// Ghostty key → ITheme key
const COLOR_KEYS = {
  background: 'background',
  foreground: 'foreground',
  'cursor-color': 'cursor',
  'cursor-text': 'cursorAccent',
  'selection-background': 'selectionBackground',
  'selection-foreground': 'selectionForeground',
};

// Ghostty format: "key = value" per line, a key can be repeated.
function parse(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    entries.push([key, value]);
  }
  return entries;
}

function readEntries(file) {
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

// Ghostty accepts "3e4251" as "#3e4251"
function color(value) {
  return /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : value;
}

// Applies the colors from a list of entries to an ITheme theme
function applyColors(theme, entries) {
  for (const [key, value] of entries) {
    if (key === 'palette') {
      const [index, hex] = value.split('=');
      const name = PALETTE_NAMES[Number(index)];
      if (name && hex) theme[name] = color(hex.trim());
    } else if (COLOR_KEYS[key]) {
      theme[COLOR_KEYS[key]] = color(value);
    }
  }
  return theme;
}

function loadTheme(name) {
  // Ghostty accepts an absolute path as is
  const candidates = name.startsWith('/') ? [name] : THEME_DIRS.map((dir) => join(dir, name));
  for (const file of candidates) {
    const entries = readEntries(file);
    if (entries.length) return applyColors({}, entries);
  }
  console.warn(`Ghostty theme not found: ${name}`);
  return {};
}

// Re-read on every page load: a change in Ghostty applies on the next
// reload.
export function loadGhosttyConfig() {
  const entries = CONFIG_FILES.flatMap(readEntries);
  const last = (key) => entries.findLast(([k]) => k === key)?.[1];

  // "theme = Name" or "theme = light:Light,dark:Dark"
  const themes = { light: {}, dark: {} };
  const themeValue = last('theme');
  if (themeValue) {
    const pair = Object.fromEntries(
      themeValue.split(',').map((part) => part.split(':').map((s) => s.trim())),
    );
    if (pair.light || pair.dark) {
      themes.light = loadTheme(pair.light || pair.dark);
      themes.dark = loadTheme(pair.dark || pair.light);
    } else {
      themes.light = themes.dark = loadTheme(themeValue);
    }
  }
  // Colors set directly in the config take precedence over the theme
  applyColors(themes.light, entries);
  if (themes.dark !== themes.light) applyColors(themes.dark, entries);

  const num = (key) => {
    const n = Number(last(key));
    return Number.isFinite(n) && last(key) !== undefined ? n : undefined;
  };
  // Multiple "font-family" = fallback fonts; an empty value resets the list
  // (as in Ghostty).
  const fontFamilies = [];
  for (const [key, value] of entries) {
    if (key !== 'font-family') continue;
    if (value) fontFamilies.push(value);
    else fontFamilies.length = 0;
  }

  return {
    themes,
    fontFamilies,
    fontSize: num('font-size'),
    fontThicken: last('font-thicken') === 'true',
    paddingX: num('window-padding-x'),
    paddingY: num('window-padding-y'),
  };
}
