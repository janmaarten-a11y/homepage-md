/**
 * Lucide icon resolver for HomepageMD.
 *
 * Reads SVG files from lucide-static at startup and serves them
 * as inline SVG markup by name. No runtime dependency — just file reads.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('lucide-static/package.json'));
const ICONS_DIR = join(pkgDir, 'icons');

/** In-memory cache: icon name → SVG markup */
const cache = new Map();

/** Set of all available icon names (loaded at startup) */
let availableNames = null;

/**
 * Load the list of available icon names from disk.
 * Called once at startup.
 */
export async function loadIconIndex() {
  try {
    const files = await readdir(ICONS_DIR);
    availableNames = new Set(
      files
        .filter((f) => f.endsWith('.svg'))
        .map((f) => basename(f, '.svg'))
    );
  } catch {
    availableNames = new Set();
  }
}

/**
 * Check whether an icon name exists in the Lucide set.
 */
export function hasIcon(name) {
  return availableNames?.has(name) ?? false;
}

/**
 * Get the inline SVG markup for a Lucide icon by name.
 * Returns null if the icon doesn't exist.
 *
 * @param {string} name - Icon name (e.g., "home", "music", "server")
 * @param {object} [options]
 * @param {number} [options.size=20] - Width and height in pixels
 * @returns {Promise<string|null>} SVG markup or null
 */
export async function getIcon(name, { size = 20 } = {}) {
  if (!hasIcon(name)) return null;

  if (cache.has(name)) {
    return applySize(cache.get(name), size);
  }

  try {
    const svg = await readFile(join(ICONS_DIR, `${name}.svg`), 'utf-8');
    // Strip the license comment and clean up whitespace
    const cleaned = svg
      .replace(/<!--[\s\S]*?-->\s*/g, '')
      .replace(/\sclass="[^"]*"/, '')
      .trim();
    cache.set(name, cleaned);
    return applySize(cleaned, size);
  } catch {
    return null;
  }
}

/**
 * Override width/height attributes on an SVG string.
 */
function applySize(svg, size) {
  return svg
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
}

/**
 * Get all available icon names. Useful for autocomplete or validation.
 */
export function getIconNames() {
  return availableNames ? [...availableNames] : [];
}
