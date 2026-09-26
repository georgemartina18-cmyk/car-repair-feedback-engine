/**
 * Starts the backend: opens the database, creates the default admin and
 * sample data if needed, then listens on PORT (default 4000).
 */
const config = require('./config');
const db = require('./db');
const { ensureDefaultAdmin } = require('./auth');
const { seedSampleData } = require('./seed');
const { createApp } = require('./app');

async function main() {
  await db.initDb(config.DB_FILE);

  if (ensureDefaultAdmin()) {
    console.log('Created the default admin account:');
    console.log(`   Email:    ${config.ADMIN_EMAIL}`);
    console.log(`   Password: ${config.ADMIN_PASSWORD}`);
    console.log('   Change this password in Admin > Settings after you log in.');
  }
  if (config.SEED_SAMPLE_DATA) {
    const added = seedSampleData();
    if (added) console.log(`Loaded ${added} sample bookings.`);
  }

  const server = createApp().listen(config.PORT, () => {
    console.log(`AutoCare running on http://localhost:${config.PORT}`);
    console.log(`Database file: ${config.DB_FILE}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${config.PORT} is already in use. The app is probably already running in another window:`);
      console.error(`open http://localhost:${config.PORT} in your browser, or close the other window and try again.`);
      console.error('(To use a different port, set PORT in backend/.env.)\n');
    } else {
      console.error('Failed to start the server:', err);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Failed to start the server:', err);
  process.exit(1);
});
