// Program favicons from simple-icons logos (CC0): white or black logo on a
// rounded square in the brand color.
import * as simpleIcons from 'simple-icons';

const BY_SLUG = new Map(
  Object.values(simpleIcons)
    .filter((icon) => icon?.slug)
    .map((icon) => [icon.slug, icon]),
);

// Dark logo on a light background, light on a dark one (WCAG relative luminance)
function logoColor(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#000' : '#fff';
}

// Favicon SVG for a simple-icons slug, or null if it doesn't exist
export function iconSvg(slug) {
  const icon = BY_SLUG.get(slug);
  if (!icon) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#${icon.hex}"/>
  <path transform="translate(5 5) scale(0.9167)" fill="${logoColor(icon.hex)}" d="${icon.path}"/>
</svg>`;
}
