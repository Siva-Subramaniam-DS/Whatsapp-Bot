import crypto from 'node:crypto';
import { PLANS } from './plans.js';

// Key format: SG-<PLAN>-<payload>.<signature>
// payload = base64url(JSON {p: plan, e: expiry ms, n: nonce})
// Signed with HMAC-SHA256 so only someone with LICENSE_SECRET can create keys.

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22);
}

export function createLicense(plan, days, secret, now = Date.now()) {
  if (!PLANS[plan] || plan === 'free') throw new Error(`Unknown paid plan: ${plan}`);
  if (!secret || secret === 'change-me') throw new Error('Set LICENSE_SECRET in .env first');
  const payload = b64(JSON.stringify({ p: plan, e: now + days * 86_400_000, n: crypto.randomBytes(4).toString('hex') }));
  return `SG-${plan.toUpperCase()}-${payload}.${sign(payload, secret)}`;
}

/** @returns {{ok:true, plan:string, expiresAt:number, id:string} | {ok:false, error:string}} */
export function verifyLicense(key, secret, now = Date.now()) {
  const m = /^SG-([A-Z]+)-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec((key || '').trim());
  if (!m) return { ok: false, error: 'That does not look like a ScamGuard key.' };
  const [, , payload, sig] = m;
  const expected = sign(payload, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, error: 'This key is not valid.' };
  }
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return { ok: false, error: 'This key is damaged.' }; }
  if (!PLANS[data.p]) return { ok: false, error: 'Unknown plan in key.' };
  if (data.e < now) return { ok: false, error: 'This key has expired. Please renew.' };
  return { ok: true, plan: data.p, expiresAt: data.e, id: sig };
}
