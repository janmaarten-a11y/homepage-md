/**
 * Auth middleware for HomepageMD.
 *
 * When AUTH_TOKEN is set, write endpoints require the token
 * via the Authorization header (Bearer <token>) or an auth cookie.
 * Read endpoints are always open.
 */

import { config } from './config.js';
import { timingSafeEqual } from 'node:crypto';

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Check whether the request carries a valid auth token.
 * Returns true if auth is disabled or the token matches.
 */
export function isAuthenticated(req) {
  if (!config.authToken) return true;

  // Check Authorization: Bearer <token>
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && safeCompare(authHeader.slice(7), config.authToken)) {
    return true;
  }

  // Check cookie: auth_token=<token>
  const cookies = parseCookies(req.headers['cookie'] || '');
  if (safeCompare(cookies['auth_token'] || '', config.authToken)) {
    return true;
  }

  return false;
}

/**
 * Whether auth is configured (AUTH_TOKEN is set).
 */
export function isAuthRequired() {
  return !!config.authToken;
}

/**
 * Send a 401 Unauthorized response.
 */
export function sendUnauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}

/**
 * Set the auth cookie on the response.
 */
export function setAuthCookie(res, token) {
  const maxAge = config.authCookieDays * 86400;
  res.setHeader('Set-Cookie', `auth_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

/**
 * Clear the auth cookie.
 */
export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key.trim()] = decodeURIComponent(rest.join('=').trim());
  }
  return cookies;
}
