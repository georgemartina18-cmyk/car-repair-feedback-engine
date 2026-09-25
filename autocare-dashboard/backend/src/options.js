/**
 * Business options: services, branches, statuses and opening hours.
 *
 * This file is the ONE place to edit when you add a service or a branch.
 * The public booking form loads these lists from GET /api/options, and the
 * backend checks every new booking against them, so a change here shows up
 * everywhere after you restart the backend.
 *
 * Renaming or removing an item does not change bookings already saved with
 * the old name. They keep that name and still show up in the admin table.
 */

// Shown in the "Service Needed" dropdown, in this order.
const SERVICES = [
  'Oil Change',
  'Full Car Maintenance',
  'Engine Repair',
  'Car Wash & Detailing',
  'Brake Service',
  'Tire Replacement / Alignment',
  'Battery Replacement',
  'AC Repair & Servicing',
  'Transmission Service',
  'Suspension & Shock Repair',
  'Body Work / Panel Beating',
  'Electrical Diagnostics',
  'Other (Specify in notes)',
];

// Shown in the "Select Branch" dropdown and used for the branch summary cards.
const BRANCHES = ['Ikeja Branch', 'Lekki Branch', 'Ikorodu Branch', 'Oshodi Branch'];

// Job statuses. The keys are what is stored in the database; the labels are
// what people see.
const STATUSES = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

// Customers can only pick a time inside these hours (24-hour clock, branch time).
const BUSINESS_HOURS = { open: '08:00', close: '18:00' };

module.exports = { SERVICES, BRANCHES, STATUSES, BUSINESS_HOURS };
