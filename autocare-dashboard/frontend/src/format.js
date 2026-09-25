/** Display helpers for money and dates. */

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

/** 25000 -> "₦25,000.00" */
export function formatNaira(amount) {
  return naira.format(Number(amount) || 0);
}

/**
 * Scheduled dates are stored as 'YYYY-MM-DD HH:MM' in branch time.
 * '2026-09-30 10:00' -> "Wed, 30 Sep 2026 · 10:00"
 */
export function formatScheduled(value) {
  if (!value) return '';
  const [date, time] = value.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${label} · ${time}`;
}

/** An ISO timestamp (UTC) shown in the viewer's local time: "25 Sep 2026, 14:05" */
export function formatTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 'YYYY-MM-DD' for today in the viewer's time zone (for date inputs). */
export function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
