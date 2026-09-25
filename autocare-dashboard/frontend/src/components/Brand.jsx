/** The AutoCare logo and name, used in the page headers. */
export default function Brand({ subtitle }) {
  return (
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#ff6b00" />
        <path d="M32 12a20 20 0 1 0 0 40 20 20 0 0 0 0-40zm0 8a12 12 0 1 1 0 24 12 12 0 0 1 0-24z" fill="#0f2942" />
        <circle cx="32" cy="32" r="5" fill="#fff" />
      </svg>
      <div>
        <div className="brand-name">
          AutoCare<span> Chain</span>
        </div>
        {subtitle && <div className="brand-sub">{subtitle}</div>}
      </div>
    </div>
  );
}
