/**
 * Public routes (no login): options for the booking form, and making a booking.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { SERVICES, BRANCHES, STATUSES, BUSINESS_HOURS } = require('../options');
const { validateBooking, createBooking } = require('../bookings');

const router = express.Router();

// Dropdown lists for the booking form.
router.get('/options', (req, res) => {
  res.json({ services: SERVICES, branches: BRANCHES, statuses: STATUSES, businessHours: BUSINESS_HOURS });
});

// Limit bookings from one address to 20 per 15 minutes, to stop spam.
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many bookings from this device. Please try again later.' },
});

// Save a booking and return its reference number.
router.post('/bookings', bookingLimiter, (req, res) => {
  const { errors, data } = validateBooking(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: errors });
  }
  const booking = createBooking(data);
  res.status(201).json({
    message: 'Booking received.',
    booking_ref: booking.booking_ref,
    booking: {
      booking_ref: booking.booking_ref,
      customer_name: booking.customer_name,
      service_type: booking.service_type,
      branch: booking.branch,
      scheduled_date: booking.scheduled_date,
      amount_paid: booking.amount_paid,
    },
  });
});

module.exports = router;
