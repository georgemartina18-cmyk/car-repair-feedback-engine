/**
 * Login, "who am I", and change password.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../auth');

const router = express.Router();

// Allow 10 failed logins per 15 minutes from one address, to slow down password guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many failed logins. Please wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const result = auth.login(email, password);
  if (!result) return res.status(401).json({ error: 'Incorrect email or password.' });
  res.json(result);
});

router.get('/me', auth.requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

router.post('/change-password', auth.requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = auth.changePassword(req.admin.id, currentPassword, newPassword);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: 'Password changed.', token: result.token });
});

module.exports = router;
