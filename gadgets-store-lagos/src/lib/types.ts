// The shapes of the store's data. These match the tables in supabase/schema.sql.

export type Condition = 'Brand New' | 'UK Used' | 'Nigerian Used';

export interface StoreSettings {
  store_name: string;
  tagline: string;
  address: string;
  phone: string; // as people type it, e.g. 08105149828
  whatsapp: string; // international format without +, e.g. 2348105149828
  email: string;
  instagram: string;
  tiktok: string;
  opening_hours: string;
  owner_name: string;
  map_query: string;
  pay_on_delivery_enabled: boolean;
  announcement: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string; // name of an icon in components/Icon.astro
  sort_order: number;
}

export interface Brand {
  id: string;
  slug: string;
  name: string;
}

export interface StorageOption {
  label: string; // e.g. "256GB" or "16GB RAM / 512GB"
  price: number;
  compare_at_price: number | null;
}

export interface Spec {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string; // brand slug
  category: string; // category slug
  short_description: string;
  description: string;
  price: number; // Naira, whole number
  compare_at_price: number | null; // old price, shown crossed out
  condition: Condition;
  stock: number;
  featured: boolean;
  colors: string[];
  storage_options: StorageOption[];
  specs: Spec[];
  images: string[];
  warranty: string;
  is_sample: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  cta_label: string;
  cta_link: string;
  image: string;
  theme: 'dark' | 'blue' | 'deal';
  sort_order: number;
  is_active: boolean;
}
