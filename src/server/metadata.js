/**
 * Metadata fetcher for HomepageMD.
 *
 * Fetches a URL's page title and meta description server-side.
 * Reuses SSRF protection from the favicon module.
 */

import { lookup } from 'node:dns/promises';
import { isPrivateIP } from './favicon.js';

const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESC_RE = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i;
const META_DESC_ALT_RE = /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i;

/**
 * Fetch page title and meta description from a URL.
 * SSRF-safe: validates resolved IP before connecting.
 *
 * @param {string} url - The URL to fetch metadata from
 * @returns {Promise<{ title: string|null, description: string|null }>}
 */
export async function fetchMetadata(url) {
  try {
    const { hostname } = new URL(url);
    const { address } = await lookup(hostname);
    if (isPrivateIP(address)) {
      return { title: null, description: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'HomepageMD Metadata Fetcher' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { title: null, description: null };
    }

    const html = await response.text();

    const titleMatch = html.match(TITLE_RE);
    const title = titleMatch ? titleMatch[1].trim() : null;

    const descMatch = html.match(META_DESC_RE) || html.match(META_DESC_ALT_RE);
    const description = descMatch ? descMatch[1].trim() : null;

    return { title, description };
  } catch {
    return { title: null, description: null };
  }
}
