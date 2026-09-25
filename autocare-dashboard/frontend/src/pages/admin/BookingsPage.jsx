/**
 * All Bookings / Jobs: filters, search, a sortable table, and status buttons.
 *
 * Filters and search run on the server. Sorting runs in the browser.
 * Status buttons update the row straight away, then save; if the save fails
 * the row goes back to how it was.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge.jsx';
import { api } from '../../api.js';
import { formatNaira, formatScheduled, formatTimestamp } from '../../format.js';

const EMPTY_FILTERS = { branch: '', status: '', from: '', to: '', q: '' };

// Table columns. `sortValue` returns what the column is sorted by.
const COLUMNS = [
  { key: 'booking_ref', label: 'Booking Ref #', sortValue: (b) => b.booking_ref },
  { key: 'customer_name', label: 'Customer Name', sortValue: (b) => b.customer_name.toLowerCase() },
  { key: 'contact', label: 'Contact', sortValue: (b) => b.customer_email },
  { key: 'service_type', label: 'Service Type', sortValue: (b) => b.service_type },
  { key: 'branch', label: 'Branch', sortValue: (b) => b.branch },
  { key: 'amount_paid', label: 'Amount Paid', sortValue: (b) => b.amount_paid, numeric: true },
  { key: 'scheduled_date', label: 'Scheduled', sortValue: (b) => b.scheduled_date },
  { key: 'status', label: 'Status', sortValue: (b) => ({ pending: 0, in_progress: 1, completed: 2 })[b.status] },
  { key: 'action', label: 'Action' },
];

export default function BookingsPage() {
  const [options, setOptions] = useState(null);
  // A link such as /admin?branch=Lekki%20Branch opens the table already filtered.
  const [params] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    branch: params.get('branch') || '',
    status: params.get('status') || '',
  }));
  const [search, setSearch] = useState(''); // typed text; copied into filters.q after a short pause
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ key: 'scheduled_date', dir: 'desc' });
  const [expanded, setExpanded] = useState(null); // id of the row whose notes are open

  useEffect(() => {
    api.options().then(setOptions).catch(() => {});
  }, []);

  // Wait 300 ms after typing stops before searching.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { bookings } = await api.bookings(filters);
      setBookings(bookings);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col?.sortValue) return bookings;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...bookings].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return b.id - a.id;
    });
  }, [bookings, sort]);

  const totalAmount = useMemo(() => bookings.reduce((s, b) => s + b.amount_paid, 0), [bookings]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  function setFilter(field) {
    return (e) => setFilters((f) => ({ ...f, [field]: e.target.value }));
  }

  function clearFilters() {
    setSearch('');
    setFilters(EMPTY_FILTERS);
  }

  async function changeStatus(booking, status) {
    const optimistic = {
      ...booking,
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : booking.completed_at,
    };
    setBookings((list) => list.map((b) => (b.id === booking.id ? optimistic : b)));
    try {
      const { booking: saved } = await api.setStatus(booking.id, status);
      setBookings((list) => list.map((b) => (b.id === saved.id ? saved : b)));
    } catch (err) {
      // Put back the server's version (or the old one), and say what went wrong.
      const restored = err.body?.booking || booking;
      setBookings((list) => list.map((b) => (b.id === booking.id ? restored : b)));
      setError(err.message);
    }
  }

  const hasFilters = Object.values(filters).some(Boolean) || search;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>All Bookings / Jobs</h1>
          <p className="muted">
            {loading ? 'Loading…' : `${bookings.length} booking${bookings.length === 1 ? '' : 's'} · ${formatNaira(totalAmount)}`}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      <div className="card filters">
        <div className="field search-field">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            type="search"
            placeholder="Customer name, phone or booking ref"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="f-branch">Branch</label>
          <select id="f-branch" value={filters.branch} onChange={setFilter('branch')}>
            <option value="">All branches</option>
            {options?.branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-from">Scheduled from</label>
          <input id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={setFilter('from')} />
        </div>
        <div className="field">
          <label htmlFor="f-to">Scheduled to</label>
          <input id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={setFilter('to')} />
        </div>
        <button className="btn btn-ghost filters-clear" onClick={clearFilters} disabled={!hasFilters}>
          Clear
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}{' '}
          <button className="btn btn-link" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className="card table-card">
        <div className="table-scroll">
          <table className="bookings-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.sortValue ? (
                      <button
                        className="sort-btn"
                        onClick={() => toggleSort(c.key)}
                        aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        {c.label}
                        <span className="sort-arrow">{sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="empty">
                    No bookings match these filters.
                  </td>
                </tr>
              )}
              {sorted.map((b) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  expanded={expanded === b.id}
                  onToggle={() => setExpanded((id) => (id === b.id ? null : b.id))}
                  onStatus={changeStatus}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BookingRow({ booking: b, expanded, onToggle, onStatus }) {
  return (
    <>
      <tr className={expanded ? 'row-open' : undefined}>
        <td data-label="Booking Ref #">
          <button className="ref-btn" onClick={onToggle} title="Show notes and timestamps">
            {b.booking_ref}
          </button>
        </td>
        <td data-label="Customer">{b.customer_name}</td>
        <td data-label="Contact" className="contact">
          <div>
            <a href={`mailto:${b.customer_email}`}>{b.customer_email}</a>
            <a href={`tel:${b.customer_phone.replace(/[^\d+]/g, '')}`}>{b.customer_phone}</a>
          </div>
        </td>
        <td data-label="Service">
          <span>
            {b.service_type}
            {b.other_details && (
              <span className="note-dot" title={b.other_details}>
                {' '}
                📝
              </span>
            )}
          </span>
        </td>
        <td data-label="Branch">{b.branch}</td>
        <td data-label="Amount Paid" className="num">
          {formatNaira(b.amount_paid)}
        </td>
        <td data-label="Scheduled" className="nowrap">
          {formatScheduled(b.scheduled_date)}
        </td>
        <td data-label="Status">
          <StatusBadge status={b.status} />
        </td>
        <td data-label="Action" className="actions">
          <StatusActions booking={b} onStatus={onStatus} />
        </td>
      </tr>
      {expanded && (
        <tr className="details-row">
          <td colSpan={COLUMNS.length}>
            <dl className="details">
              <div>
                <dt>Notes</dt>
                <dd>{b.other_details || '—'}</dd>
              </div>
              <div>
                <dt>Booked at</dt>
                <dd>{formatTimestamp(b.created_at)}</dd>
              </div>
              <div>
                <dt>Completed at</dt>
                <dd>{b.completed_at ? formatTimestamp(b.completed_at) : '—'}</dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

/** Pending: "Start" and "Mark as Completed". In progress: "Mark as Completed". Completed: a disabled green button. */
function StatusActions({ booking, onStatus }) {
  if (booking.status === 'completed') {
    return (
      <button className="btn btn-done btn-sm" disabled title={`Completed at ${formatTimestamp(booking.completed_at)}`}>
        ✅ Completed
      </button>
    );
  }
  return (
    <div className="action-group">
      {booking.status === 'pending' && (
        <button className="btn btn-secondary btn-sm" onClick={() => onStatus(booking, 'in_progress')}>
          Start job
        </button>
      )}
      <button className="btn btn-primary btn-sm" onClick={() => onStatus(booking, 'completed')}>
        Mark as Completed
      </button>
    </div>
  );
}
