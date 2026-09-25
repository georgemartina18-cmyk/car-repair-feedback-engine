/**
 * Sample bookings, so the dashboard has something to show on first run.
 *
 * They run from about two weeks ago to one week ahead, across all branches
 * and statuses. They are only added when the bookings table is empty, and
 * only if SEED_SAMPLE_DATA is not "false".
 * Run `npm run reset-data` to wipe everything and start again.
 */
const db = require('./db');
const config = require('./config');
const { SERVICES, BRANCHES } = require('./options');
const { partsInTz, dateStrInTz, addDays, startOfDayUtc } = require('./utils/time');

const FIRST_NAMES = [
  'Chinedu', 'Aisha', 'Tunde', 'Ngozi', 'Emeka', 'Funke', 'Ibrahim', 'Kemi', 'Segun', 'Amaka',
  'Yusuf', 'Bola', 'Obinna', 'Zainab', 'Femi', 'Chioma', 'Kunle', 'Halima', 'Dayo', 'Ifeoma',
];
const LAST_NAMES = [
  'Okafor', 'Bello', 'Adeyemi', 'Eze', 'Balogun', 'Nwosu', 'Abubakar', 'Ogunleye', 'Okeke', 'Lawal',
  'Adebayo', 'Obi', 'Suleiman', 'Olawale', 'Uche',
];
const NOTES = [
  null, null, null,
  'Car makes a squeaking noise when braking.',
  'Please call before starting any extra work.',
  'Toyota Camry 2015, silver.',
  'Honda Accord 2018. Check-engine light is on.',
  'Need the car back before 5pm.',
  'AC blows warm air after 10 minutes.',
  'Customer will wait at the branch.',
];
// Rough price range (Naira) per service, so the amounts look realistic.
const PRICES = {
  'Oil Change': [15000, 35000],
  'Full Car Maintenance': [60000, 150000],
  'Engine Repair': [120000, 450000],
  'Car Wash & Detailing': [5000, 25000],
  'Brake Service': [25000, 80000],
  'Tire Replacement / Alignment': [20000, 180000],
  'Battery Replacement': [45000, 110000],
  'AC Repair & Servicing': [30000, 120000],
  'Transmission Service': [80000, 350000],
  'Suspension & Shock Repair': [50000, 200000],
  'Body Work / Panel Beating': [70000, 400000],
  'Electrical Diagnostics': [15000, 60000],
  'Other (Specify in notes)': [10000, 50000],
};

// Small repeatable random generator, so every fresh install gets the same kind of data.
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function seedSampleData({ count = 48, now = new Date() } = {}) {
  if (db.get('SELECT COUNT(*) AS n FROM bookings').n > 0) return 0;

  const rand = makeRandom(20250925);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const tz = config.TIMEZONE;
  const today = dateStrInTz(now, tz);
  const nowLocal = (() => {
    const p = partsInTz(now, tz);
    return `${today} ${p.hour}:${p.minute}`;
  })();

  // Make the bookings first, then sort them by creation time so the
  // reference numbers go up in order.
  const rows = [];
  for (let i = 0; i < count; i++) {
    const createdDaysAgo = between(0, 14);
    const createdDay = addDays(today, -createdDaysAgo);
    // A creation time between 07:00 and 21:00 local, but never in the future.
    let createdAt = new Date(startOfDayUtc(createdDay, tz).getTime() + between(7 * 60, 21 * 60) * 60000);
    if (createdAt > now) createdAt = new Date(now.getTime() - between(5, 120) * 60000);

    const scheduledDay = addDays(createdDay, between(0, 6));
    const hour = String(between(8, 17)).padStart(2, '0');
    const minute = pick(['00', '15', '30', '45']);
    const scheduled = `${scheduledDay} ${hour}:${minute}`;

    // Past jobs are mostly done; today's are mixed; future jobs are pending.
    let status = 'pending';
    if (scheduled < nowLocal) {
      const r = rand();
      status = scheduledDay < today ? (r < 0.8 ? 'completed' : r < 0.9 ? 'in_progress' : 'pending')
                                    : (r < 0.4 ? 'completed' : r < 0.8 ? 'in_progress' : 'pending');
    }

    const service = pick(SERVICES);
    const [lo, hi] = PRICES[service] || [10000, 50000];
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const note = service === 'Other (Specify in notes)' ? 'Windscreen crack repair and wiper replacement.' : pick(NOTES);

    let completedAt = null;
    if (status === 'completed') {
      // Finished 1-4 hours after the scheduled time, but not in the future.
      const start = startOfDayUtc(scheduledDay, tz).getTime() + (Number(hour) * 60 + Number(minute)) * 60000;
      completedAt = new Date(Math.min(start + between(60, 240) * 60000, now.getTime())).toISOString();
    }

    rows.push({
      createdAt,
      customer_name: `${first} ${last}`,
      customer_email: `${first}.${last}${between(1, 99)}@example.com`.toLowerCase(),
      customer_phone: `+234 ${pick(['803', '806', '813', '703', '805', '809', '802', '816'])} ${between(100, 999)} ${between(1000, 9999)}`,
      service_type: service,
      other_details: note,
      branch: pick(BRANCHES),
      amount_paid: Math.round(between(lo, hi) / 500) * 500,
      scheduled_date: scheduled,
      status,
      completed_at: completedAt,
    });
  }
  rows.sort((a, b) => a.createdAt - b.createdAt);

  const perDay = {};
  db.transaction((exec) => {
    for (const r of rows) {
      const p = partsInTz(r.createdAt, tz);
      const prefix = `AUTO-${p.year.slice(2)}${p.month}${p.day}-`;
      perDay[prefix] = (perDay[prefix] || 0) + 1;
      exec(
        `INSERT INTO bookings
           (booking_ref, customer_name, customer_email, customer_phone, service_type, other_details,
            branch, amount_paid, scheduled_date, status, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prefix + String(perDay[prefix]).padStart(4, '0'),
          r.customer_name, r.customer_email, r.customer_phone, r.service_type, r.other_details,
          r.branch, r.amount_paid, r.scheduled_date, r.status, r.createdAt.toISOString(), r.completed_at,
        ]
      );
    }
  });
  return rows.length;
}

module.exports = { seedSampleData };
