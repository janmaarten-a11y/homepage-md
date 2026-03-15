import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIP, extractDomain } from '../../src/server/favicon.js';

describe('isPrivateIP', () => {
  it('blocks 127.0.0.1 (loopback)', () => {
    assert.equal(isPrivateIP('127.0.0.1'), true);
  });

  it('blocks 127.x.x.x range', () => {
    assert.equal(isPrivateIP('127.0.0.2'), true);
    assert.equal(isPrivateIP('127.255.255.255'), true);
  });

  it('blocks 10.x.x.x (private class A)', () => {
    assert.equal(isPrivateIP('10.0.0.1'), true);
    assert.equal(isPrivateIP('10.255.255.255'), true);
  });

  it('blocks 172.16-31.x.x (private class B)', () => {
    assert.equal(isPrivateIP('172.16.0.1'), true);
    assert.equal(isPrivateIP('172.31.255.255'), true);
  });

  it('allows 172.15.x.x and 172.32.x.x', () => {
    assert.equal(isPrivateIP('172.15.0.1'), false);
    assert.equal(isPrivateIP('172.32.0.1'), false);
  });

  it('blocks 192.168.x.x (private class C)', () => {
    assert.equal(isPrivateIP('192.168.0.1'), true);
    assert.equal(isPrivateIP('192.168.255.255'), true);
  });

  it('blocks 169.254.x.x (link-local)', () => {
    assert.equal(isPrivateIP('169.254.0.1'), true);
  });

  it('blocks 0.x.x.x', () => {
    assert.equal(isPrivateIP('0.0.0.0'), true);
  });

  it('allows public IPs', () => {
    assert.equal(isPrivateIP('8.8.8.8'), false);
    assert.equal(isPrivateIP('1.1.1.1'), false);
    assert.equal(isPrivateIP('93.184.216.34'), false);
  });

  it('blocks IPv6 loopback', () => {
    assert.equal(isPrivateIP('::1'), true);
    assert.equal(isPrivateIP('::'), true);
  });

  it('blocks IPv6 unique local addresses (fc/fd)', () => {
    assert.equal(isPrivateIP('fc00::1'), true);
    assert.equal(isPrivateIP('fd12:3456::1'), true);
  });

  it('blocks IPv6 link-local (fe80)', () => {
    assert.equal(isPrivateIP('fe80::1'), true);
  });

  it('blocks IPv4-mapped IPv6 with private IPv4', () => {
    assert.equal(isPrivateIP('::ffff:127.0.0.1'), true);
    assert.equal(isPrivateIP('::ffff:10.0.0.1'), true);
    assert.equal(isPrivateIP('::ffff:192.168.1.1'), true);
  });

  it('allows IPv4-mapped IPv6 with public IPv4', () => {
    assert.equal(isPrivateIP('::ffff:8.8.8.8'), false);
  });

  it('blocks malformed input (defaults to blocked)', () => {
    assert.equal(isPrivateIP('not-an-ip'), true);
    assert.equal(isPrivateIP(''), true);
  });
});

describe('extractDomain', () => {
  it('extracts hostname from HTTPS URLs', () => {
    assert.equal(extractDomain('https://www.netflix.com/browse'), 'www.netflix.com');
  });

  it('extracts hostname from HTTP URLs', () => {
    assert.equal(extractDomain('http://synology.local:5000'), 'synology.local');
  });

  it('extracts hostname from URLs with paths', () => {
    assert.equal(extractDomain('https://school.example.com/lunch'), 'school.example.com');
  });

  it('returns null for invalid URLs', () => {
    assert.equal(extractDomain('not a url'), null);
    assert.equal(extractDomain(''), null);
  });
});
