/** Coloured status pill. Colours are set in styles.css (.badge-pending, etc.). */
const LABELS = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' };

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{LABELS[status] || status}</span>;
}
