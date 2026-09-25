const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const deps = {
  S: require('../src/scoring.js'),
  T: require('../src/templates.js'),
  D: require('../src/drafts.js'),
  R: require('../src/routing.js'),
  I: require('../src/inbound.js'),
  X: require('../src/dispatch.js'),
  P: require('../src/pipeline.js'),
};
const settings = require('../config/default-settings.json');

function makeDb(url) {
  const run = (sql) => execFileSync('psql', [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const lit = (obj) => {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    if (s.includes('$rfe$')) throw new Error('payload contains dollar-quote tag');
    return `$rfe$${s}$rfe$`;
  };
  return {
    run,
    file: (f) => execFileSync('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path.join(ROOT, f)], { encoding: 'utf8' }),
    json: (sql) => { const out = run(sql); return out ? JSON.parse(out) : null; },
    call: (fn, payload) => JSON.parse(run(`SELECT ${fn}(${lit(payload)}::jsonb)`)),
    rows: (sql) => JSON.parse(run(`SELECT coalesce(json_agg(t), '[]') FROM (${sql}) t`)),
    lit,
  };
}

module.exports = { deps, settings, makeDb, ROOT };
