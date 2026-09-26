/**
 * Settings -> n8n integration.
 * Paste the n8n Webhook URL, optionally a header for Header Auth, switch it on,
 * and send a test. Every completed job is then sent to n8n (see backend/src/webhook.js).
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { formatTimestamp } from '../../format.js';

export default function N8nSettings() {
  const [form, setForm] = useState({ enabled: false, url: '', headerName: '', headerValue: '' });
  const [headerValueSet, setHeaderValueSet] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }
  const [busy, setBusy] = useState(''); // '', 'save', 'test', or a delivery id

  const load = useCallback(async () => {
    const { config, deliveries } = await api.n8n();
    setForm({ enabled: config.enabled, url: config.url, headerName: config.headerName, headerValue: '' });
    setHeaderValueSet(config.headerValueSet);
    setDeliveries(deliveries);
  }, []);

  useEffect(() => {
    load().catch((err) => setMessage({ type: 'error', text: err.message }));
  }, [load]);

  // While a delivery is still being sent (retries), refresh the list every few seconds.
  useEffect(() => {
    if (!deliveries.some((d) => d.status === 'sending')) return;
    const t = setTimeout(() => api.n8n().then((r) => setDeliveries(r.deliveries)).catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [deliveries]);

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setMessage(null);
    setBusy('save');
    try {
      const { config } = await api.saveN8n(form);
      setHeaderValueSet(config.headerValueSet);
      setForm((f) => ({ ...f, headerValue: '' }));
      setMessage({
        type: 'success',
        text: config.enabled
          ? 'Saved. Completed jobs will now be sent to n8n.'
          : 'Saved. Sending is switched off.',
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy('');
    }
  }

  async function sendTest() {
    setMessage(null);
    setBusy('test');
    try {
      // Save what's on screen first, so the test uses it.
      const { config } = await api.saveN8n(form);
      setHeaderValueSet(config.headerValueSet);
      const { delivery } = await api.testN8n();
      setMessage(
        delivery.status === 'success'
          ? { type: 'success', text: 'Test sent. n8n received it. Check the Executions list in n8n.' }
          : { type: 'error', text: `Test failed: ${delivery.error}` }
      );
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy('');
    }
  }

  async function resend(id) {
    setBusy(id);
    try {
      await api.resendN8n(id);
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy('');
    }
  }

  const isTestUrl = form.url.includes('/webhook-test/');

  return (
    <div className="card settings-card settings-wide">
      <h2>n8n integration</h2>
      <p className="muted small">
        When you click <strong>Mark as Completed</strong>, the job's details are sent to your n8n workflow.
      </p>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="n8n-url">Webhook URL</label>
          <input
            id="n8n-url"
            type="url"
            placeholder="https://yourname.app.n8n.cloud/webhook/..."
            value={form.url}
            onChange={update('url')}
          />
          {isTestUrl ? (
            <div className="field-warning">
              This is a <strong>test</strong> URL (it contains <code>/webhook-test/</code>). It only works right after
              you click "Listen for test event" in n8n. For everyday use, paste the <strong>Production URL</strong>{' '}
              (with <code>/webhook/</code>) and make sure the workflow is active in n8n.
            </div>
          ) : (
            <div className="field-hint">In n8n, open the Webhook node and copy the Production URL.</div>
          )}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="n8n-hname">Header name (optional)</label>
            <input id="n8n-hname" placeholder="e.g. X-RFE-Key" value={form.headerName} onChange={update('headerName')} />
            <div className="field-hint">Only if the Webhook node uses "Header Auth".</div>
          </div>
          <div className="field">
            <label htmlFor="n8n-hvalue">Header value (optional)</label>
            <input
              id="n8n-hvalue"
              type="password"
              autoComplete="off"
              placeholder={headerValueSet ? '•••••••• (saved; type to replace)' : ''}
              value={form.headerValue}
              onChange={update('headerValue')}
              disabled={!form.headerName}
            />
          </div>
        </div>

        <label className="switch">
          <input type="checkbox" checked={form.enabled} onChange={update('enabled')} />
          <span>Send completed jobs to n8n</span>
        </label>

        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={busy !== ''}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={sendTest} disabled={busy !== ''}>
            {busy === 'test' ? 'Sending…' : 'Send test'}
          </button>
        </div>
      </form>

      <h3 className="deliveries-title">Recent deliveries</h3>
      {deliveries.length === 0 ? (
        <p className="muted small">Nothing sent yet.</p>
      ) : (
        <ul className="deliveries">
          {deliveries.map((d) => (
            <li key={d.id}>
              <span className={`badge badge-${d.status === 'success' ? 'completed' : d.status === 'failed' ? 'failed' : 'in_progress'}`}>
                {d.status === 'success' ? 'Sent' : d.status === 'failed' ? 'Failed' : 'Sending…'}
              </span>
              <span className="delivery-main">
                <strong>{d.event === 'test' ? 'Test event' : d.booking_ref}</strong>
                <span className="muted small"> · {formatTimestamp(d.updated_at)}</span>
                {d.error && <span className="delivery-error">{d.error}</span>}
              </span>
              {d.status === 'failed' && (
                <button className="btn btn-secondary btn-sm" onClick={() => resend(d.id)} disabled={busy !== ''}>
                  {busy === d.id ? 'Sending…' : 'Resend'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
