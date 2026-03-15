/**
 * Auth middleware for HomepageMD.
 *
 * When AUTH_TOKEN is set, write endpoints require the token
 * via the Authorization header (Bearer <token>) or an auth cookie.
 * Read endpoints are always open.
 */

import { config } from './config.js';

/**
 * Check whether the request carries a valid auth token.
 * Returns true if auth is disabled or the token matches.
 */
export function isAuthenticated(req) {
  if (!config.authToken) return true;

  // Check Authorization: Bearer <token>
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === config.authToken) {
    return true;
  }

  // Check cookie: auth_token=<token>
  const cookies = parseCookies(req.headers['cookie'] || '');
  if (cookies['auth_token'] === config.authToken) {
    return true;
  }

  return false;
}

/**
 * Send a 401 Unauthorized response.
 */
export function sendUnauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  }
  return cookies;
}
