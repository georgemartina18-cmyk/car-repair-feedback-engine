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

  createApp().listen(config.PORT, () => {
    console.log(`AutoCare API running on http://localhost:${config.PORT}`);
    console.log(`Database file: ${config.DB_FILE}`);
  });
}

main().catch((err) => {
  console.error('Failed to start the server:', err);
  process.exit(1);
});
