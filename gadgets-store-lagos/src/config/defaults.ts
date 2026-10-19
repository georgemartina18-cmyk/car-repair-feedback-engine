import type { StoreSettings } from '../lib/types';

// Fallback store details. Once the database is connected, the owner edits
// these in Admin -> Settings and the site uses those values instead.
// TESTING NOTE: phone and email below are the developer's, for testing.
// Change them in Admin -> Settings before launch.
export const DEFAULT_SETTINGS: StoreSettings = {
  store_name: 'Gadgets Store in Lagos',
  tagline: '100% genuine phones, laptops and accessories from Computer Village, Ikeja.',
  address: '5 Otigba Street, Computer Village, Ikeja, Lagos',
  phone: '08105149828',
  whatsapp: '2348105149828',
  email: 'georgemartina18@gmail.com',
  instagram: 'izutech4354',
  tiktok: 'izutech4354',
  opening_hours: 'Mon–Sat, 9am–7pm',
  owner_name: 'Okonkwo Izuchukwu Philip',
  map_query: '5 Otigba Street, Computer Village, Ikeja, Lagos',
  pay_on_delivery_enabled: true,
  announcement: 'Nationwide delivery to all 36 states · Visit us at 5 Otigba St, Computer Village',
};
