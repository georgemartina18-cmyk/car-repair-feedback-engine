# AutoCare Chain Dashboard

A web app for a car care and auto repair chain with four branches. Customers book service appointments online. The admin logs in to manage, confirm and track jobs across all branches.

- **Public booking form** (`/`): customer details, service, branch, amount paid, preferred date and time. Each booking gets a reference number such as `AUTO-260925-0001`.
- **Admin panel** (`/admin`, login required):
  - **All Bookings / Jobs**: a sortable table with filters (branch, status, date range), search (name, phone, booking ref), and one-click **Mark as Completed**.
  - **Branch Summary**: bookings today and this week, pending and completed per branch, and total revenue.
  - **Settings**: change the admin password and view system info.

| | |
|---|---|
| Backend | Node.js + Express (`backend/`) |
| Database | SQLite, one file at `backend/data/autocare.sqlite`, no setup needed |
| Frontend | React + Vite (`frontend/`) |
| Auth | JWT login; one admin account is created automatically on first run |

---

## 1. Quick start (3 commands)

You need **Node.js 20.19 or newer** (22 LTS recommended) from <https://nodejs.org>. Check with `node -v`.

```bash
cd autocare-dashboard
npm install        # installs everything (root, backend and frontend)
npm run dev        # starts backend + frontend together
```

Open:

- Booking form: **<http://localhost:5173>**
- Admin panel: **<http://localhost:5173/admin>**

The first run creates the database, the admin account, and 48 sample bookings, so you see a working dashboard straight away. Press `Ctrl + C` to stop.

### Default admin login

| Email | Password |
|---|---|
| `admin@autocare.local` | `Admin@12345` |

**Change this password straight away:** Admin → **Settings** → *Change admin password*.

---

## 2. Step-by-step setup (with details)

1. **Install Node.js** 20.19+ (22 LTS recommended). npm comes with it.
2. **Get the code** and open a terminal in the `autocare-dashboard` folder.
3. **(Optional) Set your own settings.** Copy the example settings file:
   ```bash
   cp backend/.env.example backend/.env        # macOS / Linux
   copy backend\.env.example backend\.env      # Windows
   ```
   Then edit `backend/.env`. Every line is explained inside. The most useful ones:
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`: the admin created on **first run** (set these before the first start).
   - `SEED_SAMPLE_DATA=false`: start with no sample bookings.
   - `TIMEZONE`: default `Africa/Lagos`.

   Without a `.env` file, the defaults are used.
4. **Install dependencies:** `npm install`
   (This also runs `npm install` inside `backend/` and `frontend/` for you.)
5. **Start:** `npm run dev`
   - Backend API: <http://localhost:4000> (restarts when you edit backend files)
   - Frontend: <http://localhost:5173> (reloads instantly when you edit frontend files)

### Starting backend and frontend separately

Two terminals, if you prefer:

```bash
# Terminal 1: backend
cd autocare-dashboard/backend
npm install
npm run dev          # or: npm start

# Terminal 2: frontend
cd autocare-dashboard/frontend
npm install
npm run dev
```

### Running it for real (one server, one port)

```bash
npm start
```

This builds the frontend into `frontend/dist`, and the backend serves it together with the API on **<http://localhost:4000>** (change with `PORT` in `backend/.env`). This is how to deploy it on a server or VPS. Keep it running with a process manager such as `pm2`:

```bash
npm install -g pm2
npm run build
pm2 start backend/src/server.js --name autocare
```

For a public site, put it behind HTTPS (for example Nginx or Caddy as a reverse proxy) and set a strong admin password.

---

## 3. All commands

Run these from the `autocare-dashboard` folder:

| Command | What it does |
|---|---|
| `npm install` | Install all dependencies |
| `npm run dev` | Development mode: backend on :4000 and frontend on :5173, with auto-reload |
| `npm start` | Build the frontend and run everything on :4000 |
| `npm run build` | Build the frontend only |
| `npm test` | Run the backend API tests (uses a temporary database) |
| `npm run reset-password -- NewPass123` | Reset the admin password from the terminal (stop the server first) |
| `npm run reset-password -- NewPass123 --email you@company.com` | Also change the admin login email |
| `npm run reset-data` | Delete the database. The next start creates a fresh one (stop the server first) |

---

## 4. How to change the admin password

**From the admin panel (normal way):**
Log in → **Settings** → enter the current password and the new one twice → **Change password**.
The new password needs at least 8 characters, with letters and numbers. Other devices that were logged in are signed out.

**From the terminal (if you forgot it):**

```bash
# stop the server first (Ctrl + C), then:
npm run reset-password -- MyNewPassword2026
npm run dev
```

**Changing the login email:** add `--email`, e.g. `npm run reset-password -- MyNewPassword2026 --email owner@autocare.ng`.

> `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` are only used the first time, when the database has no admin. Changing them later does nothing. Use the steps above instead (or `npm run reset-data` to start over, which also deletes all bookings).

---

## 5. How to add more services or branches

Everything lives in **one file: `backend/src/options.js`**.

```js
const SERVICES = [
  'Oil Change',
  'Full Car Maintenance',
  // ...
  'Wheel Balancing',            // <- add a new service here
  'Other (Specify in notes)',
];

const BRANCHES = ['Ikeja Branch', 'Lekki Branch', 'Ikorodu Branch', 'Oshodi Branch',
                  'Ajah Branch'];   // <- add a new branch here
```

Save the file. In `npm run dev` the backend restarts by itself; otherwise restart it. Then refresh the browser. The new items appear in:

- the booking form dropdowns,
- the admin filters,
- the Branch Summary (one card per branch),

and the backend accepts them in new bookings. Nothing else needs changing: no database change, no frontend edit.

**Notes**

- Old bookings keep the name they were saved with. If you **rename** a branch, its old bookings keep the old name. The summary page still shows them as their own card, so no revenue goes missing.
- Opening hours (which times customers can choose) are in the same file: `BUSINESS_HOURS`.

---

## 6. Project structure

```
autocare-dashboard/
├── package.json                 root scripts: install / dev / start / test
├── README.md
├── backend/
│   ├── .env.example             all settings, explained
│   ├── package.json
│   ├── src/
│   │   ├── server.js            start-up: database, default admin, sample data, listen
│   │   ├── app.js               Express app: routes, security headers, serves the built frontend
│   │   ├── config.js            reads .env (with defaults)
│   │   ├── options.js           ★ services, branches, statuses, opening hours
│   │   ├── db.js                SQLite schema + helpers (all/get/run)
│   │   ├── auth.js              admin accounts, password hashing, JWT, requireAdmin
│   │   ├── bookings.js          validation, booking ref numbers, status changes
│   │   ├── seed.js              sample data
│   │   ├── utils/time.js        "today" / "this week" in the business time zone
│   │   └── routes/
│   │       ├── public.js        GET /api/options, POST /api/bookings
│   │       ├── auth.js          login, me, change-password
│   │       └── admin.js         bookings list, status, summary, system info
│   ├── scripts/
│   │   ├── reset-password.js
│   │   └── reset-data.js
│   ├── test/api.test.js
│   └── data/                    created on first run (database + JWT secret); not in git
└── frontend/
    ├── index.html
    ├── vite.config.js           dev server; forwards /api to the backend
    └── src/
        ├── main.jsx, App.jsx    page routes
        ├── api.js               all backend calls
        ├── format.js            ₦ and date formatting
        ├── styles.css           ★ all styling; brand colours at the top
        ├── components/          Brand logo, StatusBadge
        └── pages/
            ├── BookingPage.jsx          public booking form
            ├── LoginPage.jsx
            └── admin/
                ├── AdminLayout.jsx      top bar + navigation
                ├── BookingsPage.jsx     jobs table, filters, Mark as Completed
                ├── SummaryPage.jsx      branch summary cards
                └── SettingsPage.jsx     change password, system info
```

---

## 7. Data

The database is one SQLite file: `backend/data/autocare.sqlite`. **To back up, copy that file** (ideally with the server stopped). You can open it with any SQLite tool, such as [DB Browser for SQLite](https://sqlitebrowser.org/).

**`bookings`**

| Column | Type | Notes |
|---|---|---|
| `id` | integer, auto-increment | primary key |
| `booking_ref` | text, unique | `AUTO-YYMMDD-NNNN`; the number restarts at 0001 each day |
| `customer_name` | text | |
| `customer_email` | text | saved in lower case |
| `customer_phone` | text | |
| `service_type` | text | one of `SERVICES` |
| `other_details` | text, nullable | notes / special instructions |
| `branch` | text | one of `BRANCHES` |
| `amount_paid` | decimal (REAL) | Naira |
| `scheduled_date` | datetime text | `YYYY-MM-DD HH:MM`, branch local time |
| `status` | enum | `pending` \| `in_progress` \| `completed` |
| `created_at` | timestamp | ISO 8601, UTC |
| `completed_at` | timestamp, nullable | set automatically by **Mark as Completed** |

**`admin_users`**

| Column | Type | Notes |
|---|---|---|
| `id` | integer | primary key |
| `email` | text, unique | login email |
| `password_hash` | text | bcrypt hash, never the plain password |
| `role` | text | always `admin` |
| `created_at`, `password_changed_at` | timestamp | logins from before the last password change stop working |

**Job status rules:** Pending → (Start job) → In Progress → (Mark as Completed) → Completed. *Mark as Completed* also works straight from Pending. Completed is final: the button turns into a green **✅ Completed** that cannot be clicked again, and the backend refuses any further change.

---

## 8. API reference

| Method & path | Login | Purpose |
|---|---|---|
| `GET /api/options` | – | services, branches, statuses, opening hours |
| `POST /api/bookings` | – | create a booking → `{ booking_ref, booking }` |
| `POST /api/auth/login` | – | `{ email, password }` → `{ token, admin }` |
| `GET /api/auth/me` | ✔ | current admin |
| `POST /api/auth/change-password` | ✔ | `{ currentPassword, newPassword }` |
| `GET /api/admin/bookings` | ✔ | query: `branch`, `status`, `from`, `to` (YYYY-MM-DD), `q` |
| `PATCH /api/admin/bookings/:id/status` | ✔ | `{ status: "in_progress" \| "completed" }` |
| `GET /api/admin/summary` | ✔ | counts and revenue, overall and per branch |
| `GET /api/admin/system-info` | ✔ | versions, database file and size, counts |

Send the token as `Authorization: Bearer <token>`.

---

## 9. Security notes

- Passwords are stored as bcrypt hashes. Login is limited to 10 failed tries per 15 minutes per IP address, and bookings to 20 per 15 minutes per IP.
- The JWT signing secret is generated at random on first run (`backend/data/.jwt-secret`) unless you set `JWT_SECRET`.
- Changing the password signs out every other session.
- Before putting it online: change the default password, serve it over **HTTPS**, and back up `backend/data/` regularly.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot reach the server` on the form | The backend isn't running. Use `npm run dev` (starts both), or start `backend` too. |
| `EADDRINUSE: port 4000` / `5173` | Another program is using the port. Close it, or set `PORT=4001` in `backend/.env` **and** update the proxy port in `frontend/vite.config.js`. |
| Forgot admin password | `npm run reset-password -- NewPass123` (server stopped). |
| Want a clean database | `npm run reset-data`, then start again. Add `SEED_SAMPLE_DATA=false` to `.env` to skip the sample bookings. |
| `npm install` fails with a Node version error | Update Node.js to 20.19+ (22 LTS recommended). |
