// SAMPLE DATA. Used to show what the store looks like before the real
// products are added. Every sample product has `is_sample: true`, so the
// owner can delete them all at once from the admin dashboard later.
// Prices are realistic examples only.

import type { Banner, Brand, Category, Product } from '../lib/types';

export const SAMPLE_CATEGORIES: Category[] = [
  { id: 'cat-phones', slug: 'phones', name: 'Phones', description: 'iPhone, Samsung, Tecno, Infinix, Xiaomi and more.', icon: 'phone', sort_order: 1 },
  { id: 'cat-laptops', slug: 'laptops', name: 'Laptops', description: 'MacBooks, HP, Dell and Lenovo laptops for work and school.', icon: 'laptop', sort_order: 2 },
  { id: 'cat-tablets', slug: 'tablets', name: 'Tablets & iPads', description: 'iPads and Android tablets.', icon: 'tablet', sort_order: 3 },
  { id: 'cat-wearables', slug: 'wearables', name: 'Smartwatches', description: 'Apple Watch, Galaxy Watch and fitness bands.', icon: 'watch', sort_order: 4 },
  { id: 'cat-audio', slug: 'audio', name: 'Audio', description: 'AirPods, earbuds, headphones and speakers.', icon: 'headphones', sort_order: 5 },
  { id: 'cat-gaming', slug: 'gaming', name: 'Gaming', description: 'PlayStation, Xbox and controllers.', icon: 'gamepad', sort_order: 6 },
  { id: 'cat-accessories', slug: 'accessories', name: 'Accessories', description: 'Chargers, cables, power banks, cases and screen guards.', icon: 'plug', sort_order: 7 },
];

export const SAMPLE_BRANDS: Brand[] = [
  ['apple', 'Apple'],
  ['samsung', 'Samsung'],
  ['tecno', 'Tecno'],
  ['infinix', 'Infinix'],
  ['xiaomi', 'Xiaomi'],
  ['hp', 'HP'],
  ['sony', 'Sony'],
  ['jbl', 'JBL'],
  ['oraimo', 'Oraimo'],
  ['anker', 'Anker'],
].map(([slug, name]) => ({ id: `brand-${slug}`, slug, name }));

export const SAMPLE_BANNERS: Banner[] = [
  {
    id: 'banner-1',
    title: 'iPhone 16 Pro Max',
    subtitle: 'Brand new, sealed, with warranty. Pay online or on delivery in Lagos.',
    cta_label: 'Shop iPhones',
    cta_link: '/category/phones?brand=apple',
    image: '/samples/iphone-16-pro-max-cutout.svg',
    theme: 'dark',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'banner-2',
    title: 'Laptops for work & school',
    subtitle: 'MacBook, HP and Lenovo. Delivered anywhere in Nigeria.',
    cta_label: 'Shop laptops',
    cta_link: '/category/laptops',
    image: '/samples/macbook-air-13-m4-cutout.svg',
    theme: 'blue',
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'banner-3',
    title: 'Swap your old phone',
    subtitle: 'Bring your old device, add a balance, and leave with a new one.',
    cta_label: 'Request a swap',
    cta_link: '/trade-in',
    image: '/samples/galaxy-s25-ultra-cutout.svg',
    theme: 'deal',
    sort_order: 3,
    is_active: true,
  },
];

type P = Omit<Product, 'id' | 'images' | 'is_sample' | 'is_active' | 'condition' | 'created_at' | 'colors' | 'storage_options' | 'specs' | 'compare_at_price' | 'featured' | 'warranty' | 'description'> &
  Partial<Pick<Product, 'colors' | 'storage_options' | 'specs' | 'compare_at_price' | 'featured' | 'warranty' | 'description'>>;

const PHONE_WARRANTY = '12 months manufacturer warranty';
const ACCESSORY_WARRANTY = '6 months warranty';

const raw: P[] = [
  {
    slug: 'iphone-16-pro-max', name: 'Apple iPhone 16 Pro Max', brand: 'apple', category: 'phones',
    short_description: 'Titanium design, A18 Pro chip and the best iPhone camera yet.',
    price: 2150000, compare_at_price: 2300000, stock: 6, featured: true,
    colors: ['Desert Titanium', 'Natural Titanium', 'Black Titanium', 'White Titanium'],
    storage_options: [
      { label: '256GB', price: 2150000, compare_at_price: 2300000 },
      { label: '512GB', price: 2480000, compare_at_price: 2600000 },
      { label: '1TB', price: 2850000, compare_at_price: null },
    ],
    specs: [
      { label: 'Display', value: '6.9" Super Retina XDR OLED, 120Hz' },
      { label: 'Chip', value: 'A18 Pro' },
      { label: 'Camera', value: '48MP Fusion + 48MP Ultra Wide + 12MP 5x Telephoto' },
      { label: 'Battery', value: 'Up to 33 hours video playback' },
      { label: 'SIM', value: 'Nano-SIM + eSIM' },
    ],
    warranty: PHONE_WARRANTY,
  },
  {
    slug: 'iphone-16', name: 'Apple iPhone 16', brand: 'apple', category: 'phones',
    short_description: 'A18 chip, Camera Control and all-day battery.',
    price: 1350000, compare_at_price: 1450000, stock: 10, featured: true,
    colors: ['Ultramarine', 'Teal', 'Pink', 'White', 'Black'],
    storage_options: [
      { label: '128GB', price: 1350000, compare_at_price: 1450000 },
      { label: '256GB', price: 1520000, compare_at_price: null },
    ],
    specs: [
      { label: 'Display', value: '6.1" Super Retina XDR OLED' },
      { label: 'Chip', value: 'A18' },
      { label: 'Camera', value: '48MP Fusion + 12MP Ultra Wide' },
      { label: 'SIM', value: 'Nano-SIM + eSIM' },
    ],
    warranty: PHONE_WARRANTY,
  },
  {
    slug: 'galaxy-s25-ultra', name: 'Samsung Galaxy S25 Ultra', brand: 'samsung', category: 'phones',
    short_description: '200MP camera, built-in S Pen and Galaxy AI.',
    price: 1950000, compare_at_price: 2100000, stock: 4, featured: true,
    colors: ['Titanium Silverblue', 'Titanium Black', 'Titanium Gray'],
    storage_options: [
      { label: '12GB / 256GB', price: 1950000, compare_at_price: 2100000 },
      { label: '12GB / 512GB', price: 2200000, compare_at_price: null },
    ],
    specs: [
      { label: 'Display', value: '6.9" Dynamic AMOLED 2X, 120Hz' },
      { label: 'Processor', value: 'Snapdragon 8 Elite for Galaxy' },
      { label: 'Camera', value: '200MP + 50MP + 50MP + 10MP' },
      { label: 'Battery', value: '5000mAh, 45W fast charging' },
    ],
    warranty: PHONE_WARRANTY,
  },
  {
    slug: 'galaxy-a56-5g', name: 'Samsung Galaxy A56 5G', brand: 'samsung', category: 'phones',
    short_description: 'Premium look, 5G speed and 6 years of updates.',
    price: 620000, stock: 15,
    colors: ['Awesome Graphite', 'Awesome Lightgray', 'Awesome Olive'],
    storage_options: [
      { label: '8GB / 128GB', price: 620000, compare_at_price: null },
      { label: '8GB / 256GB', price: 690000, compare_at_price: null },
    ],
    specs: [
      { label: 'Display', value: '6.7" Super AMOLED, 120Hz' },
      { label: 'Camera', value: '50MP main + 12MP ultra wide + 5MP macro' },
      { label: 'Battery', value: '5000mAh, 45W fast charging' },
    ],
    warranty: PHONE_WARRANTY,
  },
  {
    slug: 'tecno-camon-40-pro', name: 'Tecno Camon 40 Pro', brand: 'tecno', category: 'phones',
    short_description: 'Slim design, bright AMOLED screen and a great selfie camera.',
    price: 420000, compare_at_price: 455000, stock: 20, featured: true,
    colors: ['Galaxy Black', 'Glacier White', 'Emerald Lake Green'],
    storage_options: [{ label: '8GB / 256GB', price: 420000, compare_at_price: 455000 }],
    specs: [
      { label: 'Display', value: '6.78" AMOLED, 144Hz' },
      { label: 'Camera', value: '50MP main + 8MP ultra wide, 50MP selfie' },
      { label: 'Battery', value: '5200mAh, 45W fast charging' },
    ],
    warranty: PHONE_WARRANTY,
  },
  {
    slug: 'infinix-note-50-pro', name: 'Infinix Note 50 Pro', brand: 'infinix', category: 'phones',
    short_description: 'Big battery, fast charging and a sharp AMOLED display.',
    price: 380000, stock: 18,
    colors: ['Titanium Grey', 'Enchanted Purple', 'Racing Edition'],
    storage_options: [{ label: '12GB / 256GB', price: 380000, compare_at_price: null }],
    specs: [
      { label: 'Display', value: '6.78" AMOLED, 144Hz' },
      { label: 'Battery', value: '5200mAh, 90W fast charging' },
      { label: 'Camera', value: '50MP main + 8MP ultra wide' },
    ],
    warranty: PHONE_WARRANTY,
  },
  {
    slug: 'redmi-note-14-pro', name: 'Xiaomi Redmi Note 14 Pro', brand: 'xiaomi', category: 'phones',
    short_description: '200MP camera and tough Gorilla Glass at a mid-range price.',
    price: 450000, compare_at_price: 480000, stock: 3,
    colors: ['Midnight Black', 'Ocean Blue', 'Lavender Purple'],
    storage_options: [{ label: '8GB / 256GB', price: 450000, compare_at_price: 480000 }],
    specs: [
      { label: 'Display', value: '6.67" AMOLED, 120Hz' },
      { label: 'Camera', value: '200MP main + 8MP ultra wide + 2MP macro' },
      { label: 'Battery', value: '5500mAh, 45W fast charging' },
    ],
    warranty: PHONE_WARRANTY,
  },
  {
    slug: 'macbook-air-13-m4', name: 'Apple MacBook Air 13" (M4)', brand: 'apple', category: 'laptops',
    short_description: 'Super light, silent and lasts all day on one charge.',
    price: 1850000, compare_at_price: 1990000, stock: 5, featured: true,
    colors: ['Sky Blue', 'Silver', 'Starlight', 'Midnight'],
    storage_options: [
      { label: '16GB RAM / 256GB', price: 1850000, compare_at_price: 1990000 },
      { label: '16GB RAM / 512GB', price: 2200000, compare_at_price: null },
    ],
    specs: [
      { label: 'Chip', value: 'Apple M4, 10-core CPU' },
      { label: 'Display', value: '13.6" Liquid Retina' },
      { label: 'Battery', value: 'Up to 18 hours' },
      { label: 'Weight', value: '1.24 kg' },
    ],
    warranty: '12 months Apple warranty',
  },
  {
    slug: 'hp-pavilion-15', name: 'HP Pavilion 15 (Core i7, 13th Gen)', brand: 'hp', category: 'laptops',
    short_description: 'Reliable all-rounder for office work, school and light design.',
    price: 850000, stock: 7,
    colors: ['Natural Silver'],
    storage_options: [{ label: '16GB RAM / 512GB SSD', price: 850000, compare_at_price: null }],
    specs: [
      { label: 'Processor', value: 'Intel Core i7-1355U' },
      { label: 'Display', value: '15.6" Full HD IPS' },
      { label: 'Storage', value: '512GB SSD' },
      { label: 'OS', value: 'Windows 11 Home' },
    ],
    warranty: '12 months warranty',
  },

  {
    slug: 'ipad-11th-gen', name: 'Apple iPad 11" (A16)', brand: 'apple', category: 'tablets',
    short_description: 'The everyday iPad for school, movies and work.',
    price: 720000, stock: 8, featured: true,
    colors: ['Blue', 'Pink', 'Yellow', 'Silver'],
    storage_options: [
      { label: '128GB Wi-Fi', price: 720000, compare_at_price: null },
      { label: '256GB Wi-Fi', price: 850000, compare_at_price: null },
    ],
    specs: [
      { label: 'Display', value: '11" Liquid Retina' },
      { label: 'Chip', value: 'A16' },
      { label: 'Connectivity', value: 'Wi-Fi 6' },
    ],
    warranty: '12 months Apple warranty',
  },
  {
    slug: 'galaxy-tab-a9-plus', name: 'Samsung Galaxy Tab A9+', brand: 'samsung', category: 'tablets',
    short_description: 'Big 11" screen with quad speakers at a friendly price.',
    price: 330000, compare_at_price: 360000, stock: 6,
    colors: ['Graphite', 'Silver'],
    storage_options: [{ label: '8GB / 128GB Wi-Fi', price: 330000, compare_at_price: 360000 }],
    specs: [
      { label: 'Display', value: '11" LCD, 90Hz' },
      { label: 'Battery', value: '7040mAh' },
    ],
    warranty: '12 months warranty',
  },
  {
    slug: 'apple-watch-series-10', name: 'Apple Watch Series 10 (GPS, 46mm)', brand: 'apple', category: 'wearables',
    short_description: 'Thinnest Apple Watch with a bigger, brighter display.',
    price: 780000, stock: 4,
    colors: ['Jet Black', 'Rose Gold', 'Silver'],
    specs: [
      { label: 'Case size', value: '46mm aluminium' },
      { label: 'Health', value: 'ECG, blood oxygen, sleep tracking' },
      { label: 'Battery', value: 'Up to 18 hours' },
    ],
    warranty: '12 months Apple warranty',
  },
  {
    slug: 'oraimo-watch-5', name: 'Oraimo Watch 5', brand: 'oraimo', category: 'wearables',
    short_description: 'Affordable smartwatch with calls, fitness tracking and long battery.',
    price: 45000, compare_at_price: 52000, stock: 25,
    colors: ['Black', 'Grey'],
    specs: [
      { label: 'Display', value: '2.01" HD' },
      { label: 'Battery', value: 'Up to 10 days' },
      { label: 'Water resistance', value: 'IP68' },
    ],
    warranty: ACCESSORY_WARRANTY,
  },
  {
    slug: 'airpods-pro-2', name: 'Apple AirPods Pro 2 (USB-C)', brand: 'apple', category: 'audio',
    short_description: 'Active noise cancellation and amazing sound.',
    price: 380000, compare_at_price: 420000, stock: 12, featured: true,
    specs: [
      { label: 'Noise cancellation', value: 'Active (ANC) with Transparency mode' },
      { label: 'Battery', value: 'Up to 30 hours with case' },
      { label: 'Charging', value: 'USB-C, MagSafe' },
    ],
    warranty: '12 months Apple warranty',
  },
  {
    slug: 'jbl-flip-6', name: 'JBL Flip 6 Portable Speaker', brand: 'jbl', category: 'audio',
    short_description: 'Loud, waterproof Bluetooth speaker for parties and outings.',
    price: 165000, stock: 10,
    colors: ['Black', 'Blue', 'Red'],
    specs: [
      { label: 'Battery', value: 'Up to 12 hours' },
      { label: 'Water resistance', value: 'IP67 waterproof and dustproof' },
    ],
    warranty: '12 months warranty',
  },
  {
    slug: 'oraimo-freepods-4', name: 'Oraimo FreePods 4 ANC Earbuds', brand: 'oraimo', category: 'audio',
    short_description: 'Noise cancelling earbuds with deep bass.',
    price: 38000, compare_at_price: 45000, stock: 30,
    colors: ['Black', 'White'],
    specs: [
      { label: 'Noise cancellation', value: 'Active (ANC)' },
      { label: 'Battery', value: 'Up to 35.5 hours with case' },
    ],
    warranty: ACCESSORY_WARRANTY,
  },
  {
    slug: 'ps5-slim', name: 'Sony PlayStation 5 Slim (Disc Edition)', brand: 'sony', category: 'gaming',
    short_description: 'Next-gen gaming with ultra-fast loading and a 1TB SSD.',
    price: 950000, compare_at_price: 1020000, stock: 3, featured: true,
    specs: [
      { label: 'Storage', value: '1TB SSD' },
      { label: 'Resolution', value: 'Up to 4K, 120fps' },
      { label: 'In the box', value: 'Console, DualSense controller, cables' },
    ],
    warranty: '12 months warranty',
  },

  {
    slug: 'apple-20w-usb-c-adapter', name: 'Apple 20W USB-C Power Adapter', brand: 'apple', category: 'accessories',
    short_description: 'Original fast charger for iPhone and iPad.',
    price: 28000, stock: 40,
    specs: [
      { label: 'Output', value: '20W USB-C' },
      { label: 'Plug', value: 'UK 3-pin' },
    ],
    warranty: ACCESSORY_WARRANTY,
  },
  {
    slug: 'oraimo-20000mah-power-bank', name: 'Oraimo Traveler 20000mAh Power Bank', brand: 'oraimo', category: 'accessories',
    short_description: 'Charges your phone 4 to 5 times. Perfect for NEPA days.',
    price: 25000, compare_at_price: 29000, stock: 2,
    specs: [
      { label: 'Capacity', value: '20000mAh' },
      { label: 'Output', value: '22.5W fast charging, USB-C + 2x USB-A' },
    ],
    warranty: ACCESSORY_WARRANTY,
  },
  {
    slug: 'anker-usb-c-cable-2m', name: 'Anker USB-C to USB-C Cable (2m, braided)', brand: 'anker', category: 'accessories',
    short_description: 'Strong braided cable for fast charging phones and laptops.',
    price: 12000, stock: 0,
    specs: [
      { label: 'Length', value: '2 metres' },
      { label: 'Power', value: 'Up to 100W' },
    ],
    warranty: ACCESSORY_WARRANTY,
  },
];

// Spread creation dates over the last weeks so "New arrivals" has an order.
const start = Date.UTC(2026, 9, 18);

export const SAMPLE_PRODUCTS: Product[] = raw.map((p, i) => ({
  id: `sample-${p.slug}`,
  description: p.short_description,
  compare_at_price: null,
  featured: false,
  colors: [],
  storage_options: [],
  specs: [],
  warranty: '',
  ...p,
  condition: 'Brand New',
  images: [`/samples/${p.slug}.svg`],
  is_sample: true,
  is_active: true,
  created_at: new Date(start - i * 86_400_000 * 1.5).toISOString(),
}));
