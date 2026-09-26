/** Settings: change the admin password, and view system info. */
import { useEffect, useState } from 'react';
import { api, setToken } from '../../api.js';
import { formatTimestamp } from '../../format.js';
import N8nSettings from './N8nSettings.jsx';

export default function SettingsPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <div className="settings-grid">
        <N8nSettings />
        <ChangePassword />
        <SystemInfo />
      </div>
    </div>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (form.next !== form.confirm) {
      setMessage({ type: 'error', text: 'The new passwords do not match.' });
      return;
    }
    setSaving(true);
    try {
      const { token } = await api.changePassword(form.current, form.next);
      setToken(token); // old tokens stop working, so keep this session going with the new one
      setForm({ current: '', next: '', confirm: '' });
      setMessage({ type: 'success', text: 'Password changed. Other devices will need to log in again.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card settings-card" onSubmit={handleSubmit}>
      <h2>Change admin password</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="field">
        <label htmlFor="pw-current">Current password</label>
        <input id="pw-current" type="password" autoComplete="current-password" value={form.current} onChange={update('current')} required />
      </div>
      <div className="field">
        <label htmlFor="pw-new">New password</label>
        <input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={form.next} onChange={update('next')} required />
        <div className="field-hint">At least 8 characters, with letters and numbers.</div>
      </div>
      <div className="field">
        <label htmlFor="pw-confirm">Confirm new password</label>
        <input id="pw-confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} required />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

function SystemInfo() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.systemInfo().then(setInfo).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="card settings-card">
      <h2>System info</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {!info && !error && <p className="muted">Loading…</p>}
      {info && (
        <dl className="info-list">
          <Row label="Application" value={`${info.app.name} v${info.app.version}`} />
          <Row label="Logged in as" value={`${info.admin.email} (${info.admin.role})`} />
          <Row label="Node.js" value={info.node} />
          <Row label="Platform" value={info.platform} />
          <Row label="Server uptime" value={formatUptime(info.uptimeSeconds)} />
          <Row label="Server time" value={formatTimestamp(info.serverTime)} />
          <Row label="Business time zone" value={info.timezone} />
          <Row label="Database" value={info.database.engine} />
          <Row label="Database file" value={<code>{info.database.file}</code>} />
          <Row label="Database size" value={`${(info.database.sizeBytes / 1024).toFixed(1)} KB`} />
          <Row label="Total bookings" value={info.database.bookings} />
          <Row label="Branches" value={info.branches.join(', ')} />
          <Row label="Login session length" value={info.tokenLifetime} />
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}
