/** Admin panel frame: top bar with navigation and log out. The pages show inside <Outlet />. */
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Brand from '../../components/Brand.jsx';
import { api, setToken } from '../../api.js';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Check the saved token is still valid, and get the admin's email for the top bar.
  useEffect(() => {
    api.me().then((r) => setAdmin(r.admin)).catch(() => {});
  }, []);

  function logout() {
    setToken(null);
    navigate('/admin/login', { replace: true });
  }

  const close = () => setMenuOpen(false);

  return (
    <div className="admin">
      <header className="admin-header">
        <div className="admin-header-row">
          <Brand subtitle="Admin panel" />
          <button
            className="menu-toggle"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ☰
          </button>
          <nav className={`admin-nav${menuOpen ? ' open' : ''}`}>
            <NavLink to="/admin" end onClick={close}>
              Bookings
            </NavLink>
            <NavLink to="/admin/summary" onClick={close}>
              Branch Summary
            </NavLink>
            <NavLink to="/admin/settings" onClick={close}>
              Settings
            </NavLink>
            <a href="/" target="_blank" rel="noreferrer" onClick={close}>
              Booking form ↗
            </a>
            <span className="nav-user" title={admin?.email}>
              {admin?.email}
            </span>
            <button className="btn btn-ghost" onClick={logout}>
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
