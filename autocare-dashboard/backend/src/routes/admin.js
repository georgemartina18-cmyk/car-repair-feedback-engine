/**
 * Admin routes (login required): bookings list, status changes, branch
 * summary and system info.
 */
const express = require('express');
const fs = require('fs');
const db = require('../db');
const config = require('../config');
const { BRANCHES, STATUSES } = require('../options');
const { updateStatus } = require('../bookings');
const { requireAdmin } = require('../auth');
const { dateStrInTz, startOfDayUtc, startOfWeek, addDays } = require('../utils/time');
const pkg = require('../../package.json');

const router = express.Router();
router.use(requireAdmin); // every route below needs a logged-in admin

/**
 * GET /api/admin/bookings
 * Optional filters (query string):
 *   branch   exact branch name
 *   status   pending | in_progress | completed
 *   from, to 'YYYY-MM-DD', matched against the scheduled date (both days included)
 *   q        search in customer name, phone and booking ref
 */
router.get('/bookings', (req, res) => {
  const where = [];
  const params = [];
  const { branch, status, from, to, q } = req.query;

  if (branch) {
    where.push('branch = ?');
    params.push(String(branch));
  }
  if (status) {
    where.push('status = ?');
    params.push(String(status));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) {
    where.push('scheduled_date >= ?');
    params.push(from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
    where.push('scheduled_date <= ?');
    params.push(`${to} 23:59`);
  }
  if (q && String(q).trim()) {
    const term = String(q).trim();
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    // Phone search ignores spaces and dashes: "0803 123" finds "08031234567".
    const digits = term.replace(/\D/g, '');
    const phoneClause = digits
      ? "OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'-',''),'(',''),')',''),'+','') LIKE ?"
      : '';
    where.push(
      `(customer_name LIKE ? ESCAPE '\\' OR customer_phone LIKE ? ESCAPE '\\' OR booking_ref LIKE ? ESCAPE '\\' ${phoneClause})`
    );
    params.push(like, like, like);
    if (digits) params.push(`%${digits}%`);
  }

  const sql = `SELECT * FROM bookings ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY scheduled_date DESC, id DESC`;
  res.json({ bookings: db.all(sql, params) });
});

/** PATCH /api/admin/bookings/:id/status  body: { status } */
router.patch('/bookings/:id/status', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid booking id.' });
  const result = updateStatus(id, req.body?.status);
  if (result.error) return res.status(result.code).json({ error: result.error, booking: result.booking });
  res.json({ booking: result.booking });
});

/** GET /api/admin/summary: numbers for the Branch Summary page. */
router.get('/summary', (req, res) => {
  const now = new Date();
  const today = dateStrInTz(now, config.TIMEZONE);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const todayStartUtc = startOfDayUtc(today, config.TIMEZONE).toISOString();
  const weekStartUtc = startOfDayUtc(weekStart, config.TIMEZONE).toISOString();

  // One query does all the counting, per branch.
  const rows = db.all(
    `SELECT branch,
            COUNT(*)                                                     AS total,
            SUM(status = 'pending')                                      AS pending,
            SUM(status = 'in_progress')                                  AS in_progress,
            SUM(status = 'completed')                                    AS completed,
            COALESCE(SUM(amount_paid), 0)                                AS revenue,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_paid END), 0) AS revenue_completed,
            SUM(created_at >= ?)                                         AS booked_today,
            SUM(created_at >= ?)                                         AS booked_week,
            SUM(substr(scheduled_date, 1, 10) = ?)                       AS scheduled_today,
            SUM(substr(scheduled_date, 1, 10) BETWEEN ? AND ?)           AS scheduled_week
       FROM bookings
      GROUP BY branch`,
    [todayStartUtc, weekStartUtc, today, weekStart, weekEnd]
  );

  // Always show every configured branch, even with zero bookings. Also show
  // old branch names that still have bookings, so no money goes missing.
  const byName = Object.fromEntries(rows.map((r) => [r.branch, r]));
  const names = [...BRANCHES, ...rows.map((r) => r.branch).filter((b) => !BRANCHES.includes(b))];
  const fields = [
    'total', 'pending', 'in_progress', 'completed', 'revenue', 'revenue_completed',
    'booked_today', 'booked_week', 'scheduled_today', 'scheduled_week',
  ];
  const branches = names.map((name) => {
    const r = byName[name] || {};
    return { branch: name, ...Object.fromEntries(fields.map((f) => [f, Number(r[f]) || 0])) };
  });

  const totals = Object.fromEntries(fields.map((f) => [f, branches.reduce((sum, b) => sum + b[f], 0)]));

  res.json({ today, weekStart, weekEnd, timezone: config.TIMEZONE, totals, branches });
});

/** GET /api/admin/system-info: shown on the Settings page. */
router.get('/system-info', (req, res) => {
  const dbFile = db.getDbFile();
  const counts = db.get(
    `SELECT (SELECT COUNT(*) FROM bookings) AS bookings, (SELECT COUNT(*) FROM admin_users) AS admins`
  );
  res.json({
    app: { name: 'AutoCare Chain Dashboard', version: pkg.version },
    node: process.version,
    platform: `${process.platform} (${process.arch})`,
    uptimeSeconds: Math.round(process.uptime()),
    timezone: config.TIMEZONE,
    serverTime: new Date().toISOString(),
    database: {
      engine: 'SQLite (sql.js)',
      file: dbFile || '(in memory)',
      sizeBytes: dbFile && fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0,
      ...counts,
    },
    statuses: STATUSES,
    branches: BRANCHES,
    tokenLifetime: config.JWT_EXPIRES_IN,
    admin: req.admin,
  });
});

module.exports = router;
