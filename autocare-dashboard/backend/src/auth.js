/**
 * Admin accounts and JWT login.
 *
 * Flow: POST /api/auth/login with email + password -> the server returns a
 * token -> the admin panel sends it on every request as
 * "Authorization: Bearer <token>". `requireAdmin` checks it.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const config = require('./config');

const MIN_PASSWORD_LENGTH = 8;

/** Create the default admin from .env if there is no admin yet. Runs on every start. */
function ensureDefaultAdmin() {
  const existing = db.get('SELECT COUNT(*) AS n FROM admin_users').n;
  if (existing > 0) return false;
  const now = new Date().toISOString();
  db.run(
    "INSERT INTO admin_users (email, password_hash, role, created_at, password_changed_at) VALUES (?, ?, 'admin', ?, ?)",
    [config.ADMIN_EMAIL, bcrypt.hashSync(config.ADMIN_PASSWORD, 10), now, now]
  );
  return true;
}

function signToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email, role: admin.role }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
}

/** Returns { token, admin } if the email + password are right, otherwise null. */
function login(email, password) {
  const admin = db.get('SELECT * FROM admin_users WHERE email = ?', [String(email || '').trim().toLowerCase()]);
  if (!admin || !bcrypt.compareSync(String(password || ''), admin.password_hash)) return null;
  return { token: signToken(admin), admin: publicAdmin(admin) };
}

/** Only the fields that are safe to send to the browser. */
function publicAdmin(admin) {
  return { id: admin.id, email: admin.email, role: admin.role };
}

/** Change a password. Returns { error } or { token } (a new token for this session). */
function changePassword(adminId, currentPassword, newPassword) {
  const admin = db.get('SELECT * FROM admin_users WHERE id = ?', [adminId]);
  if (!admin) return { error: 'Account not found.' };
  if (!bcrypt.compareSync(String(currentPassword || ''), admin.password_hash)) {
    return { error: 'Current password is incorrect.' };
  }
  const problem = checkPasswordStrength(newPassword);
  if (problem) return { error: problem };
  if (bcrypt.compareSync(newPassword, admin.password_hash)) {
    return { error: 'The new password must be different from the current one.' };
  }
  setPassword(admin.id, newPassword);
  return { token: signToken(admin) };
}

/** Save a new password hash. Tokens issued before this moment stop working. */
function setPassword(adminId, newPassword) {
  const changedAt = new Date().toISOString();
  db.run('UPDATE admin_users SET password_hash = ?, password_changed_at = ? WHERE id = ?', [
    bcrypt.hashSync(newPassword, 10),
    changedAt,
    adminId,
  ]);
}

function checkPasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}

/** Express middleware: lets the request through only with a valid admin token. */
function requireAdmin(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in.' });

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }

  const admin = db.get('SELECT * FROM admin_users WHERE id = ?', [payload.sub]);
  // Tokens issued before the last password change are refused. Token times
  // are whole seconds, so compare in seconds.
  if (!admin || payload.iat < Math.floor(Date.parse(admin.password_changed_at) / 1000)) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
  req.admin = publicAdmin(admin);
  next();
}

module.exports = {
  ensureDefaultAdmin,
  login,
  changePassword,
  setPassword,
  checkPasswordStrength,
  requireAdmin,
};
