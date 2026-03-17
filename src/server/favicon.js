/**
 * Favicon resolution for HomepageMD.
 *
 * Resolution order:
 * 1. Manual override — icons/{domain}.{png,svg,ico,webp}
 * 2. Inline override — icon: metadata from the Markdown file
 * 3. Local cache — favicon-cache/{domain}.{ext}
 * 4. Direct fetch — parse target page's <link rel="icon"> (with SSRF protection)
 * 5. DuckDuckGo fallback — https://icons.duckduckgo.com/ip3/{domain}.ico
 * 6. Generic placeholder — bundled default icon
 */

import { readdir, stat, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { lookup } from 'node:dns/promises';

const ICON_EXTENSIONS = ['.png', '.svg', '.ico', '.webp'];

const LINK_ICON_RE = /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi;
const HREF_RE = /href=["']([^"']+)["']/i;

/**
 * Check whether an IP address belongs to a private/reserved range.
 * Used to prevent SSRF when fetching favicons.
 */
export function isPrivateIP(ip) {
  // IPv6 loopback and private ranges
  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (ip.startsWith('fe80')) return true;

  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const v4 = ip.replace(/^::ffff:/, '');
  const parts = v4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;

  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

/**
 * Extract the hostname from a URL string.
 */
export function extractDomain(urlString) {
  try {
    return new URL(urlString).hostname;
  } catch {
    return null;
  }
}

/**
 * Resolve a URL only if the target IP is not private.
 * Returns the Response or null.
 */
async function safeFetch(url) {
  try {
    const { hostname } = new URL(url);
    const { address } = await lookup(hostname);
    if (isPrivateIP(address)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'HomepageMD Favicon Fetcher' },
    });
    clearTimeout(timeout);

    // Follow redirects manually with SSRF re-validation
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) return null;
      const redirectUrl = new URL(location, url).href;
      return safeFetch(redirectUrl);
    }

    return response;
  } catch {
    return null;
  }
}

/**
 * Check if a file exists at the given path.
 */
async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check manual icon overrides in the icons directory.
 * Returns the relative URL path or null.
 */
async function checkManualOverride(domain, iconsDir) {
  for (const ext of ICON_EXTENSIONS) {
    const filePath = join(iconsDir, `${domain}${ext}`);
    if (await fileExists(filePath)) {
      return `/icons/${domain}${ext}`;
    }
  }
  return null;
}

/**
 * Check cached favicon. Returns the URL path if cached and not stale, else null.
 */
async function checkCache(domain, cacheDir, ttlDays) {
  for (const ext of ICON_EXTENSIONS) {
    const filePath = join(cacheDir, `${domain}${ext}`);
    try {
      const info = await stat(filePath);
      const ageMs = Date.now() - info.mtimeMs;
      const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
      if (ageMs < ttlMs) {
        return `/favicon-cache/${domain}${ext}`;
      }
    } catch {
      // File doesn't exist
    }
  }
  return null;
}

/**
 * Fetch the favicon by parsing the target page's HTML for a <link rel="icon"> tag.
 * SSRF-safe: validates resolved IP before connecting.
 */
async function fetchFromPage(domain) {
  const pageUrl = `https://${domain}`;
  const response = await safeFetch(pageUrl);
  if (!response || !response.ok) return null;

  const html = await response.text();
  const matches = html.match(LINK_ICON_RE);
  if (!matches) return null;

  for (const tag of matches) {
    const hrefMatch = tag.match(HREF_RE);
    if (hrefMatch) {
      const href = hrefMatch[1];
      try {
        // Resolve relative URLs against the page URL
        return new URL(href, pageUrl).href;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Download an icon and save it to the cache directory.
 * Returns the cached file's URL path or null.
 */
async function downloadAndCache(iconUrl, domain, cacheDir) {
  const response = await safeFetch(iconUrl);
  if (!response || !response.ok) return null;

  // Reject downloads larger than 1 MB
  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > 1_048_576) return null;

  const contentType = response.headers.get('content-type') || '';
  let ext = '.ico';
  if (contentType.includes('png')) ext = '.png';
  else if (contentType.includes('svg')) ext = '.svg';
  else if (contentType.includes('webp')) ext = '.webp';

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 1_048_576) return null;

  const fileName = `${domain}${ext}`;
  const filePath = join(cacheDir, fileName);

  await mkdir(cacheDir, { recursive: true });
  await writeFile(filePath, buffer);

  return `/favicon-cache/${fileName}`;
}

/**
 * Resolve the best favicon URL for a bookmark.
 *
 * @param {string} url - The bookmark URL
 * @param {string|null} inlineIcon - The icon: metadata value, if any
 * @param {object} config - App configuration
 * @returns {Promise<string>} URL path to serve the favicon
 */
export async function getFaviconUrl(url, inlineIcon, config) {
  const domain = extractDomain(url);
  if (!domain) return '/icons/default.svg';

  // 1. Manual override
  const manual = await checkManualOverride(domain, config.iconsDir);
  if (manual) return manual;

  // 2. Inline override — use as-is if it's an external URL
  if (inlineIcon) return inlineIcon;

  // 3. Local cache (not stale)
  const cached = await checkCache(domain, config.faviconCacheDir, config.faviconTtlDays);
  if (cached) return cached;

  // 4. Direct fetch — parse target page for <link rel="icon">
  const pageIcon = await fetchFromPage(domain);
  if (pageIcon) {
    const savedPath = await downloadAndCache(pageIcon, domain, config.faviconCacheDir);
    if (savedPath) return savedPath;
  }

  // 5. DuckDuckGo fallback — try to download and cache
  const ddgUrl = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
  const ddgCached = await downloadAndCache(ddgUrl, domain, config.faviconCacheDir);
  if (ddgCached) return ddgCached;

  // 6. Generic placeholder
  return '/icons/default.svg';
}

/**
 * Refresh favicons for a list of bookmarks.
 * Called when a Markdown file changes. Re-fetches stale or missing icons.
 *
 * @param {Array<{url: string, icon: string|null}>} bookmarks - Flat list of bookmarks
 * @param {object} config - App configuration
 */
export async function refreshFavicons(bookmarks, config) {
  const seen = new Set();
  const tasks = [];

  for (const bookmark of bookmarks) {
    const domain = extractDomain(bookmark.url);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);

    // Skip domains that already have a cached or manual favicon
    const manual = await checkManualOverride(domain, config.iconsDir);
    if (manual) continue;
    if (bookmark.icon) continue; // Inline override
    const cached = await checkCache(domain, config.faviconCacheDir, config.faviconTtlDays);
    if (cached) continue;

    // Only fetch favicons for uncached domains
    tasks.push(getFaviconUrl(bookmark.url, bookmark.icon, config));
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

/**
 * Remove stale entries from the favicon cache.
 * Deletes files older than the configured TTL.
 *
 * @param {object} config - App configuration
 */
export async function cleanFaviconCache(config) {
  try {
    const files = await readdir(config.faviconCacheDir);
    const ttlMs = config.faviconTtlDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let removed = 0;

    for (const file of files) {
      const filePath = join(config.faviconCacheDir, file);
      try {
        const info = await stat(filePath);
        if (now - info.mtimeMs > ttlMs) {
          await unlink(filePath);
          removed++;
        }
      } catch {
        // Skip files that can't be stat'd
      }
    }

    if (removed > 0) {
      console.log(`Favicon cache: removed ${removed} stale file${removed === 1 ? '' : 's'}`);
    }
  } catch {
    // Cache directory may not exist yet
  }
}
