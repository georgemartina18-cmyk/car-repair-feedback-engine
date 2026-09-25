/**
 * Builds the Express app: API routes, plus the built frontend when it exists.
 * This file is kept apart from server.js so the tests can use the app without
 * opening a port.
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind one proxy (e.g. Nginx), for the rate limits
  app.use(express.json({ limit: '100kb' }));

  // Basic security headers.
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  // In development, Vite forwards /api calls here, so CORS is not needed.
  // Set CORS_ORIGIN only if the frontend is hosted on another address.
  if (config.CORS_ORIGIN) {
    app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
  }

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', require('./routes/public'));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Production: serve the built React app (frontend/dist) from this server.
  if (fs.existsSync(path.join(config.FRONTEND_DIST, 'index.html'))) {
    app.use(express.static(config.FRONTEND_DIST));
    // Send index.html for any other page (e.g. /admin) so React Router can show it.
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(config.FRONTEND_DIST, 'index.html')));
  }

  // Invalid JSON and unexpected errors.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

module.exports = { createApp };
