/**
 * Dashboard session tokens.
 *
 * n8n serves webhook HTML inside a CSP sandbox (opaque "null" origin), so the
 * browser will not attach the Basic-auth login to the dashboard's API calls.
 * Instead, the Basic-auth-protected page request issues a short-lived signed
 * token embedded in the page, and the API verifies it on every call.
 *
 * token = base64url(expiresAtSeconds) + "." + base64url(HMAC-SHA256(secret, payload))
 */

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function issueToken(secret, ttlSeconds, nowMs, crypto) {
  if (!secret || String(secret).length < 16) throw new Error('RFE_DASHBOARD_SECRET must be set (16+ characters)');
  const exp = Math.floor((nowMs || Date.now()) / 1000) + (ttlSeconds || 12 * 3600);
  const payload = b64url(String(exp));
  const sig = b64url(crypto.createHmac('sha256', String(secret)).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token, secret, nowMs, crypto) {
  if (!secret || !token || typeof token !== 'string' || token.length > 200) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = b64url(crypto.createHmac('sha256', String(secret)).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const exp = Number(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  return Number.isFinite(exp) && exp * 1000 > (nowMs || Date.now());
}

module.exports = { issueToken, verifyToken };
