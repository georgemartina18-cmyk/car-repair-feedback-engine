/**
 * All calls to the backend go through here.
 *
 * The admin login token is kept in localStorage and sent with every request.
 * If the backend replies 401 (not logged in or session expired), the token
 * is removed and the admin is sent back to the login page.
 */
const TOKEN_KEY = 'autocare_admin_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked (e.g. private mode): the session simply won't persist */
  }
}

/** An error from the backend. `fields` holds per-field messages for form errors. */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.fields = body?.fields || {};
    this.body = body;
  }
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and that the backend is running.', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path.startsWith('/admin')) {
      setToken(null);
      window.dispatchEvent(new Event('autocare:logout'));
    }
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export const api = {
  // Public
  options: () => request('GET', '/options'),
  createBooking: (form) => request('POST', '/bookings', form),

  // Auth
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('POST', '/auth/change-password', { currentPassword, newPassword }),

  // Admin
  bookings: (filters = {}) => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    return request('GET', `/admin/bookings${qs ? `?${qs}` : ''}`);
  },
  setStatus: (id, status) => request('PATCH', `/admin/bookings/${id}/status`, { status }),
  summary: () => request('GET', '/admin/summary'),
  systemInfo: () => request('GET', '/admin/system-info'),

  // n8n integration
  n8n: () => request('GET', '/admin/integrations/n8n'),
  saveN8n: (config) => request('PUT', '/admin/integrations/n8n', config),
  testN8n: () => request('POST', '/admin/integrations/n8n/test'),
  resendN8n: (id) => request('POST', `/admin/integrations/n8n/deliveries/${id}/resend`),
};
