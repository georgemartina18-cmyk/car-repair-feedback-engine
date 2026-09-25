#!/usr/bin/env node
/**
 * Deploy (create or update) all RFE workflows into an n8n instance via its
 * public REST API, wiring credentials by name and setting the error workflow.
 *
 *   N8N_URL=https://n8n.example.com N8N_API_KEY=... node scripts/deploy-n8n.js [--activate] [--create-credentials]
 *
 * Credentials: create them in n8n (Settings -> Credentials) with the names in
 * docs/02-n8n-setup.md, then put their ids in config/n8n-credentials.json:
 *   { "RFE Postgres": "aBcD123", "RFE Intake Key": "...", ... }
 * (the id is the last part of the URL when you open a credential).
 * Or pass --create-credentials to create them from environment variables
 * (see CREATE_FROM_ENV below) - ids are then written to that file for you.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const URL_BASE = (process.env.N8N_URL || 'http://localhost:5678').replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;
const ACTIVATE = process.argv.includes('--activate');
const CREATE = process.argv.includes('--create-credentials');
const MAP_FILE = path.join(ROOT, 'config', 'n8n-credentials.json');

const CREATE_FROM_ENV = {
  'RFE Postgres': () => ({ type: 'postgres', data: { host: env('RFE_PG_HOST', 'localhost'), port: Number(env('RFE_PG_PORT', '5432')),
    database: env('RFE_PG_DATABASE', 'rfe'), user: env('RFE_PG_USER', 'rfe'), password: env('RFE_PG_PASSWORD'),
    ssl: env('RFE_PG_SSL', 'disable'), allowUnauthorizedCerts: false, sshTunnel: false } }),
  'RFE Intake Key': () => ({ type: 'httpHeaderAuth', data: { name: 'X-RFE-Key', value: env('RFE_INTAKE_KEY') } }),
  'RFE Internal Key': () => ({ type: 'httpHeaderAuth', data: { name: 'X-RFE-Internal', value: env('RFE_INTERNAL_KEY') } }),
  'RFE WhatsApp Token': () => ({ type: 'httpHeaderAuth', data: { name: 'Authorization', value: 'Bearer ' + env('RFE_WA_ACCESS_TOKEN') } }),
  'RFE Anthropic Key': () => ({ type: 'httpHeaderAuth', data: { name: 'x-api-key', value: env('ANTHROPIC_API_KEY') } }),
  'RFE Twilio': () => ({ type: 'twilioApi', data: { authType: 'authToken', accountSid: env('RFE_TWILIO_ACCOUNT_SID'), authToken: env('RFE_TWILIO_AUTH_TOKEN') } }),
  'RFE SMTP': () => ({ type: 'smtp', data: { user: env('RFE_SMTP_USER'), password: env('RFE_SMTP_PASSWORD'), host: env('RFE_SMTP_HOST'),
    port: Number(env('RFE_SMTP_PORT', '587')), secure: env('RFE_SMTP_SECURE', 'false') === 'true' } }),
  'RFE Dashboard Login': () => ({ type: 'httpBasicAuth', data: { user: env('RFE_DASHBOARD_USER', 'manager'), password: env('RFE_DASHBOARD_PASSWORD') } }),
};

function env(k, d) {
  const v = process.env[k] ?? d;
  if (v === undefined || v === '') throw new Error(`environment variable ${k} is required for --create-credentials`);
  return v;
}

async function api(method, p, body) {
  const r = await fetch(URL_BASE + '/api/v1' + p, {
    method, headers: { 'X-N8N-API-KEY': KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function listWorkflows() {
  const all = [];
  let cursor;
  do {
    const r = await api('GET', '/workflows?limit=250' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    all.push(...r.data);
    cursor = r.nextCursor;
  } while (cursor);
  return all;
}

const SETTINGS_KEYS = ['executionOrder', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions',
  'callerPolicy', 'timezone', 'errorWorkflow', 'executionTimeout', 'saveExecutionProgress'];

async function main() {
  if (!KEY) throw new Error('Set N8N_API_KEY (n8n: Settings -> n8n API -> Create API key)');
  let map = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) : {};

  if (CREATE) {
    for (const [name, fn] of Object.entries(CREATE_FROM_ENV)) {
      if (map[name]) { console.log(`credential "${name}" already mapped (${map[name]})`); continue; }
      const { type, data } = fn();
      const c = await api('POST', '/credentials', { name, type, data });
      map[name] = c.id;
      console.log(`created credential "${name}" -> ${c.id}`);
    }
    fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2) + '\n');
  }

  const files = fs.readdirSync(path.join(ROOT, 'workflows')).filter((f) => f.endsWith('.json')).sort();
  const existing = await listWorkflows();
  const ids = {};
  const missing = new Set();

  for (const f of files) {
    const w = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', f), 'utf8'));
    for (const n of w.nodes) {
      for (const cred of Object.values(n.credentials || {})) {
        if (map[cred.name]) cred.id = map[cred.name];
        else missing.add(cred.name);
      }
    }
    const settings = Object.fromEntries(Object.entries(w.settings).filter(([k]) => SETTINGS_KEYS.includes(k)));
    if (ids.error && !f.startsWith('00-')) settings.errorWorkflow = ids.error;
    const body = { name: w.name, nodes: w.nodes, connections: w.connections, settings };
    const found = existing.find((e) => e.name === w.name);
    const res = found ? await api('PUT', `/workflows/${found.id}`, body) : await api('POST', '/workflows', body);
    ids[f.startsWith('00-') ? 'error' : f] = res.id;
    console.log(`${found ? 'updated' : 'created'}  ${w.name}  (${res.id})`);
  }

  if (missing.size) {
    console.warn('\nThese credentials are not mapped yet - open the workflows in n8n and select them, or add ids to config/n8n-credentials.json:');
    for (const m of missing) console.warn('  - ' + m);
  }
  if (ACTIVATE) {
    if (missing.size) throw new Error('Not activating while credentials are missing.');
    for (const [k, id] of Object.entries(ids)) {
      if (k === 'error') continue; // error workflows are triggered, not activated
      await api('POST', `/workflows/${id}/activate`);
      console.log('activated', k);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
