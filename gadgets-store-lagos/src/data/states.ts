// Starting delivery fees per state (Naira). These are placeholders: the
// owner changes them in Admin -> Delivery fees.

export interface DeliveryZone {
  state: string;
  fee: number;
  eta: string; // estimated delivery time shown to customers
}

const SOUTH_WEST = ['Ogun', 'Oyo', 'Osun', 'Ondo', 'Ekiti'];
const NEAR = ['Edo', 'Delta', 'Kwara', 'FCT - Abuja', 'Kogi', 'Anambra', 'Enugu', 'Imo', 'Abia', 'Rivers', 'Bayelsa', 'Ebonyi', 'Cross River', 'Akwa Ibom'];

export const NIGERIAN_STATES = [
  'Lagos', 'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT - Abuja', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Nasarawa', 'Niger', 'Ogun',
  'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = NIGERIAN_STATES.map((state) => {
  if (state === 'Lagos') return { state, fee: 3000, eta: 'Same day or next day' };
  if (SOUTH_WEST.includes(state)) return { state, fee: 5000, eta: '1–3 working days' };
  if (NEAR.includes(state)) return { state, fee: 7000, eta: '2–4 working days' };
  return { state, fee: 9000, eta: '3–5 working days' };
});
