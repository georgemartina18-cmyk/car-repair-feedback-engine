/**
 * Reset the admin password from the command line, for when you are locked out.
 * Stop the backend first, then run it, then start the backend again.
 *
 *   npm run reset-password -- NewPassword123
 *   npm run reset-password -- NewPassword123 --email you@yourcompany.com   (also changes the login email)
 */
const config = require('../src/config');
const db = require('../src/db');
const { setPassword, checkPasswordStrength, ensureDefaultAdmin } = require('../src/auth');

async function main() {
  // Arguments: the new password, and optionally "--email new@email.com".
  const args = process.argv.slice(2);
  let newEmail = null;
  const emailIdx = args.indexOf('--email');
  if (emailIdx >= 0) {
    newEmail = String(args[emailIdx + 1] || '').trim().toLowerCase();
    args.splice(emailIdx, 2);
  }
  const password = args[0];

  if (!password) {
    console.log('Usage: npm run reset-password -- <new-password> [--email new@email.com]');
    process.exit(1);
  }
  const problem = checkPasswordStrength(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  if (newEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    console.error('Please give a valid email after --email.');
    process.exit(1);
  }

  await db.initDb(config.DB_FILE);
  ensureDefaultAdmin();
  const admin = db.get('SELECT * FROM admin_users ORDER BY id LIMIT 1');
  setPassword(admin.id, password);
  if (newEmail) db.run('UPDATE admin_users SET email = ? WHERE id = ?', [newEmail, admin.id]);

  console.log(`Password updated for ${newEmail || admin.email}. Start the backend and log in.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
