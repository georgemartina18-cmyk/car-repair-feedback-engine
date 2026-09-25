/**
 * Page routes:
 *   /                     public booking form
 *   /admin/login          admin login
 *   /admin                all bookings / jobs (login required)
 *   /admin/summary        branch summary
 *   /admin/settings       change password, system info
 */
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import BookingPage from './pages/BookingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import BookingsPage from './pages/admin/BookingsPage.jsx';
import SummaryPage from './pages/admin/SummaryPage.jsx';
import SettingsPage from './pages/admin/SettingsPage.jsx';
import { getToken } from './api.js';

/** Shows the admin pages only when a login token exists; otherwise goes to the login page. */
function RequireAdmin({ children }) {
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(Boolean(getToken()));

  // api.js fires this event when the backend says the session has expired.
  useEffect(() => {
    const onLogout = () => {
      setLoggedIn(false);
      navigate('/admin/login', { replace: true, state: { expired: true } });
    };
    window.addEventListener('autocare:logout', onLogout);
    return () => window.removeEventListener('autocare:logout', onLogout);
  }, [navigate]);

  return loggedIn ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BookingPage />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<BookingsPage />} />
        <Route path="summary" element={<SummaryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
