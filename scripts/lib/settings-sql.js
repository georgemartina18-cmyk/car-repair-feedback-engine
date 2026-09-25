/**
 * config/default-settings.json -> database/003_settings.sql
 * Inserts each top-level key into app_settings WITHOUT overwriting values an
 * admin has already changed in the database (ON CONFLICT DO NOTHING). New keys
 * added in later versions are merged in (existing values win).
 */
const fs = require('fs');
const path = require('path');

function settingsSql(root) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config', 'default-settings.json'), 'utf8'));
  const lines = [
    '-- GENERATED from config/default-settings.json by `npm run build`. Do not edit by hand.',
    '-- Existing values in app_settings are preserved; new keys are merged underneath them.',
  ];
  for (const [key, value] of Object.entries(cfg)) {
    // runtime values (secrets) are never overwritten by a re-run; only missing keys are added

    const json = JSON.stringify(value);
    if (json.includes('$cfg$')) throw new Error('settings contain $cfg$');
    lines.push(`INSERT INTO app_settings (key, value) VALUES ('${key}', $cfg$${json}$cfg$::jsonb)\n` +
      `  ON CONFLICT (key) DO UPDATE SET value = $cfg$${json}$cfg$::jsonb || app_settings.value, updated_at = now();`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { settingsSql };
