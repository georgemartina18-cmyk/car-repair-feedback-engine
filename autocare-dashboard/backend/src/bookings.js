/**
 * Booking rules: checking form input, making booking reference numbers,
 * saving bookings and changing their status.
 */
const db = require('./db');
const config = require('./config');
const { SERVICES, BRANCHES, STATUSES, BUSINESS_HOURS } = require('./options');
const { partsInTz, dateStrInTz } = require('./utils/time');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Check and clean the booking form input.
 * Returns { errors, data }. `errors` maps field name -> message, and is
 * empty when the input is valid.
 */
function validateBooking(input, now = new Date()) {
  const errors = {};
  const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

  const data = {
    customer_name: str(input.customer_name),
    customer_email: str(input.customer_email).toLowerCase(),
    customer_phone: str(input.customer_phone),
    service_type: str(input.service_type),
    other_details: str(input.other_details) || null,
    branch: str(input.branch),
    amount_paid: input.amount_paid,
    date: str(input.scheduled_date),
    time: str(input.scheduled_time),
  };

  if (data.customer_name.length < 2) errors.customer_name = 'Please enter your full name.';
  else if (data.customer_name.length > 100) errors.customer_name = 'Name is too long (max 100 characters).';

  if (!EMAIL_RE.test(data.customer_email) || data.customer_email.length > 254) {
    errors.customer_email = 'Please enter a valid email address.';
  }

  // Allows +234 803 123 4567, 0803-123-4567, (0803) 1234567 and similar.
  const digits = data.customer_phone.replace(/\D/g, '');
  if (!/^\+?[\d\s\-()]+$/.test(data.customer_phone) || digits.length < 7 || digits.length > 15) {
    errors.customer_phone = 'Please enter a valid phone / WhatsApp number.';
  }

  if (!SERVICES.includes(data.service_type)) errors.service_type = 'Please choose a service.';
  if (!BRANCHES.includes(data.branch)) errors.branch = 'Please choose a branch.';

  if (data.service_type === 'Other (Specify in notes)' && !data.other_details) {
    errors.other_details = 'Please describe the service you need.';
  }
  if (data.other_details && data.other_details.length > 1000) {
    errors.other_details = 'Notes are too long (max 1000 characters).';
  }

  const amount = typeof data.amount_paid === 'number' ? data.amount_paid : Number(str(data.amount_paid));
  if (str(data.amount_paid) === '' || !Number.isFinite(amount) || amount < 0) {
    errors.amount_paid = 'Please enter the amount paid (0 or more).';
  } else if (amount > 100_000_000) {
    errors.amount_paid = 'Amount looks too large. Please check it.';
  } else {
    data.amount_paid = Math.round(amount * 100) / 100; // keep kobo, drop anything smaller
  }

  const today = dateStrInTz(now, config.TIMEZONE);
  if (!DATE_RE.test(data.date) || Number.isNaN(Date.parse(`${data.date}T00:00:00Z`))) {
    errors.scheduled_date = 'Please choose a date.';
  } else if (data.date < today) {
    errors.scheduled_date = 'The date cannot be in the past.';
  }

  if (!TIME_RE.test(data.time)) {
    errors.scheduled_time = 'Please choose a time.';
  } else if (data.time < BUSINESS_HOURS.open || data.time > BUSINESS_HOURS.close) {
    errors.scheduled_time = `Please choose a time between ${BUSINESS_HOURS.open} and ${BUSINESS_HOURS.close}.`;
  } else if (!errors.scheduled_date && data.date === today) {
    const p = partsInTz(now, config.TIMEZONE);
    if (data.time < `${p.hour}:${p.minute}`) errors.scheduled_time = 'That time has already passed today.';
  }

  const clean = {
    customer_name: data.customer_name,
    customer_email: data.customer_email,
    customer_phone: data.customer_phone,
    service_type: data.service_type,
    other_details: data.other_details,
    branch: data.branch,
    amount_paid: data.amount_paid,
    scheduled_date: `${data.date} ${data.time}`,
  };
  return { errors, data: clean };
}

/**
 * Next booking reference for the day of `now`: AUTO-YYMMDD-NNNN.
 * The number restarts at 0001 each day, e.g. AUTO-250925-0001, AUTO-250925-0002.
 */
function nextBookingRef(now = new Date()) {
  const p = partsInTz(now, config.TIMEZONE);
  const prefix = `AUTO-${p.year.slice(2)}${p.month}${p.day}-`;
  const row = db.get(
    'SELECT booking_ref FROM bookings WHERE booking_ref LIKE ? ORDER BY booking_ref DESC LIMIT 1',
    [`${prefix}%`]
  );
  const last = row ? parseInt(row.booking_ref.slice(prefix.length), 10) : 0;
  return prefix + String(last + 1).padStart(4, '0');
}

/**
 * Save a new booking (input must already be validated) and return it.
 * Node runs this in one go, so two bookings at once cannot get the same ref.
 */
function createBooking(data, now = new Date()) {
  const bookingRef = nextBookingRef(now);
  const { lastId } = db.run(
    `INSERT INTO bookings
       (booking_ref, customer_name, customer_email, customer_phone, service_type,
        other_details, branch, amount_paid, scheduled_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      bookingRef,
      data.customer_name,
      data.customer_email,
      data.customer_phone,
      data.service_type,
      data.other_details,
      data.branch,
      data.amount_paid,
      data.scheduled_date,
      now.toISOString(),
    ]
  );
  return db.get('SELECT * FROM bookings WHERE id = ?', [lastId]);
}

/**
 * Change a booking's status.
 * - Completed is final: a completed job cannot be changed again.
 * - Moving to completed saves the "completed at" time.
 * Returns { booking } or { error, code }.
 */
function updateStatus(id, status, now = new Date()) {
  if (!Object.hasOwn(STATUSES, status)) return { error: 'Unknown status.', code: 400 };

  const booking = db.get('SELECT * FROM bookings WHERE id = ?', [id]);
  if (!booking) return { error: 'Booking not found.', code: 404 };
  if (booking.status === 'completed') {
    return { error: 'This job is already completed.', code: 409, booking };
  }

  if (status === 'completed') {
    db.run("UPDATE bookings SET status = 'completed', completed_at = ? WHERE id = ?", [now.toISOString(), id]);
  } else {
    db.run('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
  }
  return { booking: db.get('SELECT * FROM bookings WHERE id = ?', [id]) };
}

module.exports = { validateBooking, nextBookingRef, createBooking, updateStatus };
