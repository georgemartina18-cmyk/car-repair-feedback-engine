/**
 * SQLite database layer.
 *
 * Uses sql.js: SQLite compiled to WebAssembly. It needs no native build
 * tools, so `npm install` works the same on Windows, macOS and Linux. The
 * whole database lives in memory and is saved to one file (DB_FILE) after
 * every change. That file is a normal SQLite database, so you can open it
 * with any SQLite viewer (for example "DB Browser for SQLite").
 *
 * Use the three helpers below instead of touching `db` directly:
 *   all(sql, params)  -> array of row objects
 *   get(sql, params)  -> first row object or undefined
 *   run(sql, params)  -> runs a change and saves the file
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bookings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_ref     TEXT    NOT NULL UNIQUE,          -- e.g. AUTO-250925-0001
  customer_name   TEXT    NOT NULL,
  customer_email  TEXT    NOT NULL,
  customer_phone  TEXT    NOT NULL,
  service_type    TEXT    NOT NULL,
  other_details   TEXT,                             -- notes / special instructions
  branch          TEXT    NOT NULL,
  amount_paid     REAL    NOT NULL DEFAULT 0,       -- Naira
  scheduled_date  TEXT    NOT NULL,                 -- 'YYYY-MM-DD HH:MM', branch local time
  status          TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at      TEXT    NOT NULL,                 -- ISO 8601, UTC
  completed_at    TEXT                              -- ISO 8601, UTC; set when completed
);
CREATE INDEX IF NOT EXISTS idx_bookings_branch    ON bookings (branch);
CREATE INDEX IF NOT EXISTS idx_bookings_status    ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled ON bookings (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_bookings_created   ON bookings (created_at);

-- Simple key/value settings changed from the admin panel (e.g. the n8n webhook).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                               -- JSON
);

-- One row per webhook sent to n8n, newest kept (see webhook.js).
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event        TEXT NOT NULL,                       -- job.completed | test
  booking_ref  TEXT,
  status       TEXT NOT NULL,                       -- sending | success | failed
  http_status  INTEGER,
  error        TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  payload      TEXT NOT NULL,                       -- JSON body that was sent
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  created_at          TEXT NOT NULL,
  password_changed_at TEXT NOT NULL                 -- older login tokens stop working
);
`;

let db = null;
let dbFile = null;

/**
 * Open (or create) the database. Pass `null` as the file for a throwaway
 * in-memory database, which the tests use.
 */
async function initDb(file) {
  const SQL = await initSqlJs();
  dbFile = file;
  if (file && fs.existsSync(file)) {
    db = new SQL.Database(fs.readFileSync(file));
  } else {
    db = new SQL.Database();
  }
  db.exec(SCHEMA);
  save();
}

/** Write the in-memory database to disk. Writes a temp file, then renames it, so a crash cannot leave half a file. */
function save() {
  if (!dbFile) return;
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, dbFile);
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function get(sql, params = []) {
  return all(sql, params)[0];
}

/** Run an INSERT/UPDATE/DELETE, save to disk, and return { changes, lastId }. */
function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lastId = get('SELECT last_insert_rowid() AS id').id;
  save();
  return { changes, lastId };
}

/**
 * Run several changes as one unit: all of them are saved, or none are.
 * Inside `fn`, use `exec(sql, params)`, which does not save after each statement.
 */
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn((sql, params = []) => db.run(sql, params));
    db.exec('COMMIT');
    save();
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getDbFile() {
  return dbFile;
}

module.exports = { initDb, all, get, run, transaction, getDbFile };
