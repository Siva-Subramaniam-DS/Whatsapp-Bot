import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLicense, verifyLicense } from '../src/billing/license.js';

const SECRET = 'test-secret-123';

test('valid key verifies with the right plan', () => {
  const key = createLicense('pro', 30, SECRET);
  const r = verifyLicense(key, SECRET);
  assert.equal(r.ok, true);
  assert.equal(r.plan, 'pro');
});

test('key signed with another secret is rejected', () => {
  const key = createLicense('business', 30, 'other-secret');
  assert.equal(verifyLicense(key, SECRET).ok, false);
});

test('tampered plan is rejected', () => {
  const key = createLicense('pro', 30, SECRET);
  const [, payload, sig] = /^SG-[A-Z]+-([^.]+)\.(.+)$/.exec(key);
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  data.p = 'business';
  const forged = `SG-BUSINESS-${Buffer.from(JSON.stringify(data)).toString('base64url')}.${sig}`;
  assert.equal(verifyLicense(forged, SECRET).ok, false);
});

test('expired key is rejected', () => {
  const key = createLicense('pro', 1, SECRET, Date.now() - 2 * 86_400_000);
  const r = verifyLicense(key, SECRET);
  assert.equal(r.ok, false);
  assert.match(r.error, /expired/);
});

test('refuses to create keys with the default secret', () => {
  assert.throws(() => createLicense('pro', 30, 'change-me'));
});
