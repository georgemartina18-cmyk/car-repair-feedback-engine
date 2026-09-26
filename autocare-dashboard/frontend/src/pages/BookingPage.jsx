/**
 * Public booking form.
 * The service and branch dropdowns come from the backend (backend/src/options.js).
 * On submit: save, show the booking reference, and clear the form.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand.jsx';
import { api, getToken } from '../api.js';
import { formatNaira, formatScheduled, todayLocal } from '../format.js';

const EMPTY_FORM = {
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  service_type: '',
  other_details: '',
  branch: '',
  amount_paid: '',
  scheduled_date: '',
  scheduled_time: '',
};

export default function BookingPage() {
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const successRef = useRef(null);
  const adminLoggedIn = Boolean(getToken());

  useEffect(() => {
    api.options().then(setOptions).catch((err) => setLoadError(err.message));
  }, []);

  // Move the success message into view after a booking.
  useEffect(() => {
    if (confirmation) successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [confirmation]);

  function update(field) {
    return (e) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setErrors((errs) => ({ ...errs, [field]: undefined }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const result = await api.createBooking(form);
      setConfirmation(result.booking);
      setForm(EMPTY_FORM);
      setErrors({});
    } catch (err) {
      setErrors(err.fields);
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const hours = options?.businessHours || { open: '08:00', close: '18:00' };
  const otherSelected = form.service_type.startsWith('Other');

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="container header-row">
          <Brand subtitle="Car care & auto repair · Lagos" />
          {/* Logged-in admins see a way back to the dashboard, so the public
              page doesn't look like they were logged out. */}
          <Link to="/admin" className="header-link">
            {adminLoggedIn ? '← Admin dashboard' : 'Staff login'}
          </Link>
        </div>
      </header>
      {adminLoggedIn && (
        <div className="admin-preview-bar">
          You are logged in as admin. This is the public booking form your customers see.{' '}
          <Link to="/admin">Back to the dashboard</Link>
        </div>
      )}

      <section className="hero">
        <div className="container">
          <h1>Book a service appointment</h1>
          <p>
            Fill in the form and we will have your car booked in at the branch you choose. Opening hours:{' '}
            {hours.open}–{hours.close}.
          </p>
        </div>
      </section>

      <main className="container booking-wrap">
        {confirmation && (
          <div className="alert alert-success booking-success" ref={successRef} role="status">
            <div className="success-icon" aria-hidden="true">✓</div>
            <div>
              <h2>Booking confirmed!</h2>
              <p>
                Your booking reference number is <strong className="ref">{confirmation.booking_ref}</strong>.
                Please keep it for your visit.
              </p>
              <p className="muted">
                {confirmation.service_type} at {confirmation.branch} on {formatScheduled(confirmation.scheduled_date)} ·
                Amount paid: {formatNaira(confirmation.amount_paid)}
              </p>
              <button type="button" className="btn btn-link" onClick={() => setConfirmation(null)}>
                Make another booking
              </button>
            </div>
          </div>
        )}

        <form className="card booking-form" onSubmit={handleSubmit} noValidate>
          {loadError && <div className="alert alert-error">{loadError}</div>}
          {formError && <div className="alert alert-error">{formError}</div>}

          <fieldset>
            <legend>Your details</legend>
            <Field label="Customer Full Name" id="customer_name" required error={errors.customer_name}>
              <input
                id="customer_name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Chinedu Okafor"
                value={form.customer_name}
                onChange={update('customer_name')}
                required
                maxLength={100}
              />
            </Field>

            <div className="grid-2">
              <Field label="Email Address" id="customer_email" required error={errors.customer_email}>
                <input
                  id="customer_email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={form.customer_email}
                  onChange={update('customer_email')}
                  required
                />
              </Field>
              <Field label="Phone Number / WhatsApp" id="customer_phone" required error={errors.customer_phone}>
                <input
                  id="customer_phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="e.g. 0803 123 4567"
                  value={form.customer_phone}
                  onChange={update('customer_phone')}
                  required
                />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Service</legend>
            <div className="grid-2">
              <Field label="Service Needed" id="service_type" required error={errors.service_type}>
                <select id="service_type" value={form.service_type} onChange={update('service_type')} required>
                  <option value="">Select a service…</option>
                  {options?.services.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Select Branch" id="branch" required error={errors.branch}>
                <select id="branch" value={form.branch} onChange={update('branch')} required>
                  <option value="">Select a branch…</option>
                  {options?.branches.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Additional Notes / Special Instructions"
              id="other_details"
              required={otherSelected}
              hint={otherSelected ? 'Please describe the service you need.' : 'Optional: car make/model, symptoms, requests.'}
              error={errors.other_details}
            >
              <textarea
                id="other_details"
                rows={4}
                maxLength={1000}
                placeholder="e.g. Toyota Corolla 2016. Brakes squeak when stopping."
                value={form.other_details}
                onChange={update('other_details')}
              />
            </Field>
          </fieldset>

          <fieldset>
            <legend>Payment & appointment</legend>
            <Field label="Amount Paid (₦)" id="amount_paid" required error={errors.amount_paid}>
              <div className="input-prefix">
                <span aria-hidden="true">₦</span>
                <input
                  id="amount_paid"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="Enter amount manually"
                  value={form.amount_paid}
                  onChange={update('amount_paid')}
                  required
                />
              </div>
            </Field>

            <div className="grid-2">
              <Field label="Preferred Date" id="scheduled_date" required error={errors.scheduled_date}>
                <input
                  id="scheduled_date"
                  type="date"
                  min={todayLocal()}
                  value={form.scheduled_date}
                  onChange={update('scheduled_date')}
                  required
                />
              </Field>
              <Field
                label="Preferred Time"
                id="scheduled_time"
                required
                hint={`Between ${hours.open} and ${hours.close}`}
                error={errors.scheduled_time}
              >
                <input
                  id="scheduled_time"
                  type="time"
                  min={hours.open}
                  max={hours.close}
                  step={900}
                  value={form.scheduled_time}
                  onChange={update('scheduled_time')}
                  required
                />
              </Field>
            </div>
          </fieldset>

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting || !options}>
            {submitting ? 'Submitting…' : 'Submit Booking'}
          </button>
        </form>
      </main>

      <footer className="public-footer">
        <div className="container">
          {options && `${options.branches.join(' · ')} — `}© {new Date().getFullYear()} AutoCare Chain
        </div>
      </footer>
    </div>
  );
}

/** A label, the input, and an optional hint or error message. */
function Field({ label, id, required, hint, error, children }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label} {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : (
        hint && <div className="field-hint">{hint}</div>
      )}
    </div>
  );
}
