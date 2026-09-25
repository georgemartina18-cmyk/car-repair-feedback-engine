/**
 * Branch Summary Overview: headline cards, then one card per branch.
 * "Received" means bookings made that day/week. "Scheduled" means
 * appointments booked for that day/week.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

export default function SummaryPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    api.summary().then(setData).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>;

  const t = data.totals;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Branch Summary</h1>
          <p className="muted">
            Today is {data.today}; this week runs {data.weekStart} to {data.weekEnd} ({data.timezone}).
          </p>
        </div>
        <button className="btn btn-secondary" onClick={load}>
          ↻ Refresh
        </button>
      </div>

      <div className="stat-grid">
        <Stat label="Bookings Today" value={t.booked_today} sub={`${t.scheduled_today} appointments scheduled today`} />
        <Stat label="Bookings This Week" value={t.booked_week} sub={`${t.scheduled_week} appointments scheduled this week`} />
        <Stat label="Pending" value={t.pending} sub={`${t.in_progress} in progress`} tone="pending" />
        <Stat label="Completed" value={t.completed} sub={`of ${t.total} bookings in total`} tone="completed" />
      </div>

      <h2 className="section-title">Per branch</h2>
      <div className="branch-grid">
        {data.branches.map((b) => (
          <div className="card branch-card" key={b.branch}>
            <div className="branch-card-head">
              <h3>{b.branch}</h3>
              <Link to={`/admin?branch=${encodeURIComponent(b.branch)}`} title="View this branch's bookings" className="muted small">
                {b.total} total
              </Link>
            </div>
            <ProgressBar pending={b.pending} inProgress={b.in_progress} completed={b.completed} />
            <dl className="branch-stats">
              <div><dt>Pending</dt><dd className="t-pending">{b.pending}</dd></div>
              <div><dt>In progress</dt><dd className="t-progress">{b.in_progress}</dd></div>
              <div><dt>Completed</dt><dd className="t-completed">{b.completed}</dd></div>
              <div><dt>New today</dt><dd>{b.booked_today}</dd></div>
              <div><dt>New this week</dt><dd>{b.booked_week}</dd></div>
              <div><dt>Scheduled today</dt><dd>{b.scheduled_today}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`card stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** One bar split into pending / in progress / completed. */
function ProgressBar({ pending, inProgress, completed }) {
  const total = pending + inProgress + completed || 1;
  const pct = (n) => `${(n / total) * 100}%`;
  return (
    <div className="progress" role="img" aria-label={`${completed} completed, ${inProgress} in progress, ${pending} pending`}>
      <span className="p-completed" style={{ width: pct(completed) }} />
      <span className="p-progress" style={{ width: pct(inProgress) }} />
      <span className="p-pending" style={{ width: pct(pending) }} />
    </div>
  );
}
