/**
 * Delete the database file, so the next start is a clean first run: the
 * default admin from .env and fresh sample data (unless SEED_SAMPLE_DATA=false).
 * Stop the backend before running this.
 *
 *   npm run reset-data
 */
const fs = require('fs');
const config = require('../src/config');

if (fs.existsSync(config.DB_FILE)) {
  fs.unlinkSync(config.DB_FILE);
  console.log(`Deleted ${config.DB_FILE}.`);
} else {
  console.log('No database file found. Nothing to delete.');
}
console.log('Start the backend again to create a fresh database.');
