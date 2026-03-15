import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthenticated } from '../../src/server/auth.js';
import { config } from '../../src/server/config.js';

function mockRequest(headers = {}) {
  return { headers };
}

describe('isAuthenticated', () => {
  let originalToken;

  beforeEach(() => {
    originalToken = config.authToken;
  });

  afterEach(() => {
    config.authToken = originalToken;
  });

  it('returns true when no auth token is configured', () => {
    config.authToken = null;
    assert.equal(isAuthenticated(mockRequest()), true);
  });

  it('returns true for valid Bearer token', () => {
    config.authToken = 'test-secret';
    const req = mockRequest({ authorization: 'Bearer test-secret' });
    assert.equal(isAuthenticated(req), true);
  });

  it('returns false for invalid Bearer token', () => {
    config.authToken = 'test-secret';
    const req = mockRequest({ authorization: 'Bearer wrong-token' });
    assert.equal(isAuthenticated(req), false);
  });

  it('returns false for missing Authorization header', () => {
    config.authToken = 'test-secret';
    assert.equal(isAuthenticated(mockRequest()), false);
  });

  it('returns true for valid auth cookie', () => {
    config.authToken = 'test-secret';
    const req = mockRequest({ cookie: 'auth_token=test-secret' });
    assert.equal(isAuthenticated(req), true);
  });

  it('returns false for invalid auth cookie', () => {
    config.authToken = 'test-secret';
    const req = mockRequest({ cookie: 'auth_token=wrong' });
    assert.equal(isAuthenticated(req), false);
  });

  it('returns true for valid cookie among multiple cookies', () => {
    config.authToken = 'test-secret';
    const req = mockRequest({ cookie: 'other=val; auth_token=test-secret; third=x' });
    assert.equal(isAuthenticated(req), true);
  });

  it('returns false for Bearer prefix without space', () => {
    config.authToken = 'test-secret';
    const req = mockRequest({ authorization: 'Bearertest-secret' });
    assert.equal(isAuthenticated(req), false);
  });
});
