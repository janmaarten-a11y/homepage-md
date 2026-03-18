import { createServer } from 'node:http';
import { readFile, readdir, stat, watch } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { config } from './config.js';
import { parseMarkdown } from './parser.js';
import { renderPage } from './renderer.js';
import { getFaviconUrl, refreshFavicons, extractDomain, cleanFaviconCache } from './favicon.js';
import { addBookmark, removeBookmark, updateBookmark, updateLocation } from './writer.js';
import { isAuthenticated, sendUnauthorized } from './auth.js';
import { fetchMetadata } from './metadata.js';
import { fetchWeather, clearWeatherCache } from './weather.js';
import { loadIconIndex, getIcon, getIcons } from './lucide.js';

/** Lucide icon names used in the weather panel (sent to client as 16px). */
const WEATHER_ICON_NAMES = [
  'sun', 'cloud-sun', 'cloud', 'cloud-fog', 'cloud-drizzle', 'cloud-rain',
  'snowflake', 'cloud-snow', 'cloud-lightning', 'thermometer', 'arrow-up-down',
  'wind', 'haze', 'moon', 'sunrise', 'sunset', 'eclipse', 'moon-star',
  'signal', 'triangle-alert', 'map-pin-pen', 'map-pin-check', 'clipboard-check', 'check',
];

/** Lucide icon names used in the server-rendered UI. */
const UI_ICON_NAMES_20 = ['menu', 'settings', 'table-of-contents', 'bookmark-plus'];
const UI_ICON_NAMES_16 = ['rows-3', 'columns-3', 'list', 'list-chevrons-up-down', 'list-chevrons-down-up', 'sun', 'moon', 'monitor', 'palette'];
const UI_ICON_NAMES_14 = ['pencil', 'trash-2', 'copy'];
const UI_ICON_NAMES_24 = ['plus'];

/** Cached icon SVGs (resolved once at first use). */
let weatherIconsCache = null;
let uiIconsCache = null;

async function getWeatherIcons() {
  if (!weatherIconsCache) {
    weatherIconsCache = await getIcons(WEATHER_ICON_NAMES, { size: 16 });
  }
  return weatherIconsCache;
}

async function getUIIcons() {
  if (!uiIconsCache) {
    const [icons20, icons16, icons14, icons24] = await Promise.all([
      getIcons(UI_ICON_NAMES_20, { size: 20 }),
      getIcons(UI_ICON_NAMES_16, { size: 16 }),
      getIcons(UI_ICON_NAMES_14, { size: 14 }),
      getIcons(UI_ICON_NAMES_24, { size: 24 }),
    ]);
    uiIconsCache = { ...icons20, ...icons16, ...icons14, ...icons24 };
  }
  return uiIconsCache;
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.json': 'application/json',
};

const sseClients = new Set();

/** In-memory cache: slug → { bookmarkUrl: faviconUrl } */
const faviconCache = new Map();

/**
 * Load footer content from the footer Markdown file.
 * Returns null if the file doesn't exist.
 */
async function loadFooter() {
  try {
    const source = await readFile(config.footerPath, 'utf-8');
    return source.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Scan the themes directory for available .css theme files.
 * Returns an array of theme names (without extension).
 */
async function getThemeList() {
  try {
    const files = await readdir(config.themesDir);
    return files
      .filter((f) => f.endsWith('.css'))
      .map((f) => f.replace(/\.css$/, ''))
      .sort((a, b) => a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b));
  } catch {
    return ['default'];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get all .md filenames (without extension) from the bookmarks directory.
 */
async function getPageSlugs() {
  try {
    const files = await readdir(config.bookmarksDir);
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Parse a single bookmarks Markdown file and resolve page metadata.
 */
async function loadPage(slug) {
  const filePath = join(config.bookmarksDir, `${slug}.md`);
  const source = await readFile(filePath, 'utf-8');
  return parseMarkdown(source);
}

/**
 * Collect page names from all Markdown files for the nav.
 */
async function getPageList() {
  const slugs = await getPageSlugs();
  const pages = [];
  for (const slug of slugs) {
    try {
      const data = await loadPage(slug);
      pages.push({ name: data.title || slug, slug });
    } catch {
      pages.push({ name: slug, slug });
    }
  }
  return pages;
}

/**
 * Collect all bookmarks from parsed page data into a flat list.
 */
function flattenBookmarks(pageData) {
  const bookmarks = [];
  for (const category of pageData.categories) {
    bookmarks.push(...category.bookmarks);
    for (const sub of category.subcategories) {
      bookmarks.push(...sub.bookmarks);
    }
  }
  return bookmarks;
}

/**
 * Build a map of bookmark URL → favicon URL for rendering.
 * Uses an in-memory cache per slug to avoid repeated file-system lookups.
 */
async function resolveFavicons(slug, bookmarks) {
  const cached = faviconCache.get(slug);
  if (cached) {
    // Check if all bookmarks are in the cached map
    const missing = bookmarks.filter((b) => !(b.url in cached));
    if (missing.length === 0) return cached;
  }

  const map = cached ? { ...cached } : {};
  const uncached = bookmarks.filter((b) => !(b.url in map));

  if (uncached.length > 0) {
    const TIMEOUT = 2000;
    const raceWithTimeout = (promise, fallback) =>
      Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), TIMEOUT))]);

    const entries = await Promise.allSettled(
      uncached.map(async (b) => {
        const url = await raceWithTimeout(
          getFaviconUrl(b.url, b.icon, config),
          '/icons/default.svg'
        );
        return { bookmarkUrl: b.url, faviconUrl: url };
      }),
    );
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        map[entry.value.bookmarkUrl] = entry.value.faviconUrl;
      }
    }
  }

  faviconCache.set(slug, map);
  return map;
}

/**
 * Resolve Lucide icon SVGs for all categories and subcategories.
 * Returns a map of section id → SVG markup.
 */
async function resolveCategoryIcons(pageData) {
  const map = {};
  for (const cat of pageData.categories) {
    if (cat.icon) {
      const svg = await getIcon(cat.icon, { size: 24 });
      if (svg) map[cat.id] = svg;
    }
    for (const sub of cat.subcategories) {
      if (sub.icon) {
        const svg = await getIcon(sub.icon, { size: 24 });
        if (svg) map[sub.id] = svg;
      }
    }
  }
  return map;
}

/**
 * Serve a static file from a base directory with path traversal protection.
 */
async function serveStatic(res, baseDir, relativePath) {
  const safePath = resolve(baseDir, relativePath);
  const normBase = resolve(baseDir) + '/';
  if (!safePath.startsWith(normBase) && safePath !== resolve(baseDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(safePath);
    const ext = extname(safePath);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(':ok\n\n');

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
}

function broadcastSSE(eventData) {
  const message = `data: ${JSON.stringify(eventData)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

// ---------------------------------------------------------------------------
// File watcher
// ---------------------------------------------------------------------------

async function startWatcher() {
  let debounceTimer = null;

  try {
    const watcher = watch(config.bookmarksDir, { recursive: false });
    for await (const event of watcher) {
      if (event.filename && event.filename.endsWith('.md')) {
        // Debounce: wait 500ms after last change before broadcasting
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          broadcastSSE({ type: 'update', file: event.filename });

          // Refresh favicons in the background and rebuild the in-memory cache
          const slug = event.filename.replace(/\.md$/, '');
          loadPage(slug)
            .then(async (pageData) => {
              const bookmarks = flattenBookmarks(pageData);
              await refreshFavicons(bookmarks, config);
              // Rebuild the in-memory map from disk cache
              const map = {};
              const TIMEOUT = 2000;
              const raceWithTimeout = (promise, fallback) =>
                Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), TIMEOUT))]);
              const entries = await Promise.allSettled(
                bookmarks.map(async (b) => {
                  const url = await raceWithTimeout(
                    getFaviconUrl(b.url, b.icon, config),
                    '/icons/default.svg'
                  );
                  return { bookmarkUrl: b.url, faviconUrl: url };
                }),
              );
              for (const entry of entries) {
                if (entry.status === 'fulfilled') {
                  map[entry.value.bookmarkUrl] = entry.value.faviconUrl;
                }
              }
              faviconCache.set(slug, map);
            })
            .catch(() => {});
        }, 500);
      }
    }
  } catch (err) {
    console.error('File watcher error:', err.message);
    console.error('Live updates will not work. Restart the server to retry.');
  }
}

// ---------------------------------------------------------------------------
// JSON body parser
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX_BODY = 64 * 1024; // 64 KB
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * Validate that a URL uses a safe protocol (http or https only).
 */
function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check for the CSRF-prevention header on state-changing requests.
 * Browsers won't send custom headers in cross-origin simple requests.
 */
function hasCsrfHeader(req) {
  return req.headers['x-requested-with'] === 'HomepageMD';
}

/**
 * Simple in-memory rate limiter. Returns true if the request is allowed.
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX_WRITES = 30;
const RATE_LIMIT_MAX_FETCHES = 10;

function isRateLimited(req, maxRequests) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    entry = { start: now, count: 0 };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  return entry.count > maxRequests;
}

/**
 * Sanitize a category or subcategory name for safe Markdown use.
 */
function sanitizeCategoryName(name) {
  if (!name) return name;
  return name.replace(/[\n\r]/g, ' ').replace(/^#+\s*/, '').trim();
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

async function handleApiBookmark(req, res, slug) {
  if (!isAuthenticated(req)) {
    sendUnauthorized(res);
    return;
  }

  if (!hasCsrfHeader(req)) {
    sendJSON(res, 403, { error: 'Missing CSRF header' });
    return;
  }

  if (isRateLimited(req, RATE_LIMIT_MAX_WRITES)) {
    sendJSON(res, 429, { error: 'Too many requests' });
    return;
  }

  const filePath = join(config.bookmarksDir, `${slug}.md`);

  try {
    if (req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.title || !body.url || !body.category) {
        sendJSON(res, 400, { error: 'Missing required fields: title, url, category' });
        return;
      }
      if (!isSafeUrl(body.url)) {
        sendJSON(res, 400, { error: 'URL must use http or https protocol' });
        return;
      }
      if (body.icon && !isSafeUrl(body.icon)) {
        sendJSON(res, 400, { error: 'Icon URL must use http or https protocol' });
        return;
      }
      await addBookmark(filePath, {
        title: body.title,
        url: body.url,
        description: body.description || null,
        icon: body.icon || null,
        category: sanitizeCategoryName(body.category),
        subcategory: sanitizeCategoryName(body.subcategory) || null,
      });
      sendJSON(res, 201, { ok: true });
      return;
    }

    if (req.method === 'PUT') {
      const body = JSON.parse(await readBody(req));
      if (!body.url) {
        sendJSON(res, 400, { error: 'Missing required field: url (identifier)' });
        return;
      }
      if (body.newUrl && !isSafeUrl(body.newUrl)) {
        sendJSON(res, 400, { error: 'URL must use http or https protocol' });
        return;
      }
      if (body.icon && !isSafeUrl(body.icon)) {
        sendJSON(res, 400, { error: 'Icon URL must use http or https protocol' });
        return;
      }
      // If category is provided, move the bookmark (remove + add)
      if (body.category) {
        const { parseMarkdown } = await import('./parser.js');
        const source = await readFile(filePath, 'utf-8');
        const pageData = parseMarkdown(source);
        // Find the current bookmark data
        let current = null;
        for (const cat of pageData.categories) {
          current = cat.bookmarks.find((b) => b.url === body.url);
          if (current) break;
          for (const sub of cat.subcategories) {
            current = sub.bookmarks.find((b) => b.url === body.url);
            if (current) break;
          }
          if (current) break;
        }
        if (!current) {
          sendJSON(res, 404, { error: 'Bookmark not found' });
          return;
        }
        await removeBookmark(filePath, body.url);
        await addBookmark(filePath, {
          title: body.title ?? current.title,
          url: body.newUrl ?? current.url,
          description: body.description !== undefined ? body.description : current.description,
          icon: body.icon !== undefined ? body.icon : current.icon,
          category: sanitizeCategoryName(body.category),
          subcategory: sanitizeCategoryName(body.subcategory) || null,
        });
      } else {
        await updateBookmark(filePath, body.url, {
          title: body.title,
          url: body.newUrl,
          description: body.description,
          icon: body.icon,
        });
      }
      sendJSON(res, 200, { ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const body = JSON.parse(await readBody(req));
      if (!body.url) {
        sendJSON(res, 400, { error: 'Missing required field: url' });
        return;
      }
      await removeBookmark(filePath, body.url);
      sendJSON(res, 200, { ok: true });
      return;
    }

    res.writeHead(405);
    res.end('Method not allowed');
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    sendJSON(res, status, { error: err.message });
  }
}

async function handleApiMetadata(req, res) {
  if (!isAuthenticated(req)) {
    sendUnauthorized(res);
    return;
  }

  if (!hasCsrfHeader(req)) {
    sendJSON(res, 403, { error: 'Missing CSRF header' });
    return;
  }

  if (isRateLimited(req, RATE_LIMIT_MAX_FETCHES)) {
    sendJSON(res, 429, { error: 'Too many requests' });
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  try {
    const body = JSON.parse(await readBody(req));
    if (!body.url) {
      sendJSON(res, 400, { error: 'Missing required field: url' });
      return;
    }
    if (!isSafeUrl(body.url)) {
      sendJSON(res, 400, { error: 'URL must use http or https protocol' });
      return;
    }
    const metadata = await fetchMetadata(body.url);
    sendJSON(res, 200, metadata);
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  // SSE endpoint
  if (pathname === '/api/events') {
    handleSSE(req, res);
    return;
  }

  // API: fetch metadata from URL
  if (pathname === '/api/metadata') {
    await handleApiMetadata(req, res);
    return;
  }

  // API: weather data for a page's location
  const weatherMatch = pathname.match(/^\/api\/weather\/([a-zA-Z0-9_-]+)$/);
  if (weatherMatch && req.method === 'GET') {
    const slug = weatherMatch[1];
    const locale = req.headers['accept-language']?.split(',')[0] || '';
    const refresh = url.searchParams.has('refresh');
    if (refresh) {
      if (isRateLimited(req, RATE_LIMIT_MAX_FETCHES)) {
        sendJSON(res, 429, { error: 'Too many requests' });
        return;
      }
      clearWeatherCache();
    }
    try {
      const pageData = await loadPage(slug);
      if (!pageData.location) {
        sendJSON(res, 200, null);
        return;
      }
      const weather = await fetchWeather(pageData.location, locale);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      });
      res.end(JSON.stringify(weather));
    } catch {
      sendJSON(res, 200, null);
    }
    return;
  }

  // API: update location — PUT /api/location/{slug}
  const locationMatch = pathname.match(/^\/api\/location\/([a-zA-Z0-9_-]+)$/);
  if (locationMatch && req.method === 'PUT') {
    if (!isAuthenticated(req)) { sendUnauthorized(res); return; }
    if (!hasCsrfHeader(req)) { sendJSON(res, 403, { error: 'Missing CSRF header' }); return; }
    if (isRateLimited(req, RATE_LIMIT_MAX_WRITES)) { sendJSON(res, 429, { error: 'Too many requests' }); return; }

    const slug = locationMatch[1];
    const filePath = join(config.bookmarksDir, `${slug}.md`);
    try {
      const body = JSON.parse(await readBody(req));
      const location = body.location?.trim() || null;
      await updateLocation(filePath, location);
      clearWeatherCache();
      sendJSON(res, 200, { ok: true });
    } catch (err) {
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  // API: bookmark CRUD — /api/bookmarks/{slug}
  const apiMatch = pathname.match(/^\/api\/bookmarks\/([a-zA-Z0-9_-]+)$/);
  if (apiMatch) {
    const slug = apiMatch[1];
    const slugs = await getPageSlugs();
    if (!slugs.includes(slug)) {
      sendJSON(res, 404, { error: 'Page not found' });
      return;
    }
    await handleApiBookmark(req, res, slug);
    return;
  }

  // Static assets — CSS
  if (pathname.startsWith('/styles/')) {
    const file = pathname.slice('/styles/'.length);
    await serveStatic(res, join('src', 'public', 'styles'), file);
    return;
  }

  // Static assets — JS
  if (pathname.startsWith('/scripts/')) {
    const file = pathname.slice('/scripts/'.length);
    await serveStatic(res, join('src', 'public', 'scripts'), file);
    return;
  }

  // Custom CSS (served from project root)
  if (pathname === '/custom.css') {
    await serveStatic(res, '.', config.customCssPath);
    return;
  }

  // Theme stylesheets
  if (pathname.startsWith('/themes/')) {
    const file = pathname.slice('/themes/'.length);
    await serveStatic(res, config.themesDir, file);
    return;
  }

  // Manual icon overrides
  if (pathname.startsWith('/icons/')) {
    const file = pathname.slice('/icons/'.length);
    await serveStatic(res, config.iconsDir, file);
    return;
  }

  // Cached favicons
  if (pathname.startsWith('/favicon-cache/')) {
    const file = pathname.slice('/favicon-cache/'.length);
    await serveStatic(res, config.faviconCacheDir, file);
    return;
  }

  // Page routes
  if (req.method === 'GET') {
    const slugs = await getPageSlugs();
    let slug;

    if (pathname === '/') {
      slug = slugs.includes(config.defaultPage) ? config.defaultPage : slugs[0];
    } else {
      slug = pathname.slice(1);
    }

    if (!slug || !slugs.includes(slug)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html lang="en"><head><title>Not Found</title></head><body><h1>Page not found</h1></body></html>');
      return;
    }

    try {
      const pageData = await loadPage(slug);
      const pages = await getPageList();
      const bookmarks = flattenBookmarks(pageData);
      const faviconUrls = await resolveFavicons(slug, bookmarks);
      const categoryIcons = await resolveCategoryIcons(pageData);
      const weatherIcons = await getWeatherIcons();
      const uiIcons = await getUIIcons();
      const footerContent = await loadFooter();
      const themes = await getThemeList();

      // Read theme preference from cookie (avoids FOUC)
      const cookieHeader = req.headers.cookie || '';
      const themeMatch = cookieHeader.match(/(?:^|;\s*)homepage-md-theme=([^;]+)/);
      const activeTheme = themeMatch ? decodeURIComponent(themeMatch[1]) : 'default';

      const html = renderPage(pageData, { pages, currentSlug: slug, faviconUrls, categoryIcons, weatherIcons, uiIcons, defaultPage: config.defaultPage, footerContent, themes, activeTheme });

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      console.error(`Error rendering page "${slug}":`, err.message);
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html lang="en"><head><title>Error</title></head><body><h1>Internal Server Error</h1></body></html>');
    }
    return;
  }

  res.writeHead(405);
  res.end('Method not allowed');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const server = createServer(handleRequest);

server.listen(config.port, () => {
  console.log(`HomepageMD running at http://localhost:${config.port}`);
  console.log(`Default page: ${config.defaultPage}`);
  console.log(`Bookmarks dir: ${resolve(config.bookmarksDir)}`);
});

startWatcher();
cleanFaviconCache(config);
loadIconIndex();
