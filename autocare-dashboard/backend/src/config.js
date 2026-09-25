/**
 * Runtime settings, read from backend/.env (see .env.example).
 * Every setting has a working default, so the app runs without a .env file.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const BACKEND_ROOT = path.join(__dirname, '..');

// Relative paths in .env are resolved from the backend folder, not from
// wherever the command was started.
function resolveFromBackend(p) {
  return path.isAbsolute(p) ? p : path.join(BACKEND_ROOT, p);
}

const DB_FILE = resolveFromBackend(process.env.DB_FILE || 'data/autocare.sqlite');

/**
 * JWT secret. If JWT_SECRET is not set, a random one is created once and kept
 * in data/.jwt-secret, so logins survive restarts without any setup.
 */
function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(path.dirname(DB_FILE), '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = {
  PORT: Number(process.env.PORT) || 4000,
  DB_FILE,
  JWT_SECRET: loadJwtSecret(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',

  // The admin account created on first run (only if no admin exists yet).
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'admin@autocare.local').trim().toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@12345',

  // "Today" and "this week" on the dashboard, and the date in booking refs,
  // use this time zone.
  TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos',

  // Load sample bookings when the database is empty. Set to "false" to start clean.
  SEED_SAMPLE_DATA: (process.env.SEED_SAMPLE_DATA || 'true').toLowerCase() !== 'false',

  // Only needed when the frontend runs on a different address than the backend.
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',

  FRONTEND_DIST: path.join(BACKEND_ROOT, '..', 'frontend', 'dist'),
};
