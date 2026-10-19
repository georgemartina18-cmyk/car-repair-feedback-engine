-- =====================================================================
-- GADGETS STORE IN LAGOS: DATABASE SETUP
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- Then run seed.sql to add the sample products.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Store settings (one row only) ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  store_name text not null,
  tagline text not null default '',
  address text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  instagram text not null default '',
  tiktok text not null default '',
  opening_hours text not null default '',
  owner_name text not null default '',
  map_query text not null default '',
  pay_on_delivery_enabled boolean not null default true,
  announcement text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- Catalogue ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  icon text not null default 'plug',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  brand text references brands(slug) on update cascade on delete set null,
  category text references categories(slug) on update cascade on delete set null,
  short_description text not null default '',
  description text not null default '',
  price int not null check (price >= 0),                 -- Naira
  compare_at_price int check (compare_at_price >= 0),     -- old price (crossed out)
  condition text not null default 'Brand New' check (condition in ('Brand New', 'UK Used', 'Nigerian Used')),
  stock int not null default 0 check (stock >= 0),
  featured boolean not null default false,
  colors text[] not null default '{}',
  storage_options jsonb not null default '[]',            -- [{label, price, compare_at_price}]
  specs jsonb not null default '[]',                      -- [{label, value}]
  images text[] not null default '{}',
  warranty text not null default '',
  is_sample boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on products (category) where is_active;
create index if not exists products_brand_idx on products (brand) where is_active;
create index if not exists products_created_idx on products (created_at desc);

create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null default '',
  cta_label text not null default 'Shop now',
  cta_link text not null default '/',
  image text not null default '',
  theme text not null default 'dark' check (theme in ('dark', 'blue', 'deal')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Delivery ----------
create table if not exists delivery_zones (
  state text primary key,
  fee int not null check (fee >= 0),
  eta text not null default '',
  is_active boolean not null default true
);

-- ---------- Orders ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  phone text not null,
  email text not null,
  address text not null default '',
  city text not null default '',
  state text not null default '',
  delivery_method text not null check (delivery_method in ('lagos', 'interstate', 'pickup')),
  delivery_fee int not null default 0,
  subtotal int not null,
  total int not null,
  payment_method text not null check (payment_method in ('paystack', 'pay_on_delivery')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed', 'refunded')),
  paystack_reference text unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_phone_idx on orders (phone);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  variant text not null default '',
  unit_price int not null,
  quantity int not null check (quantity > 0),
  image text not null default ''
);
create index if not exists order_items_order_idx on order_items (order_id);

-- ---------- Customer submissions ----------
create table if not exists trade_ins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null default '',
  current_device text not null,
  current_condition text not null default '',
  desired_device text not null,
  notes text not null default '',
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reviews_product_idx on reviews (product_id) where approved;

create table if not exists newsletter_subscribers (
  email text primary key,
  created_at timestamptz not null default now()
);

-- ---------- Who is allowed into the admin dashboard ----------
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- Keep updated_at fresh
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists products_touch on products;
create trigger products_touch before update on products for each row execute function touch_updated_at();
drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders for each row execute function touch_updated_at();

-- =====================================================================
-- SECURITY RULES (Row Level Security)
-- Visitors can only READ public things. Everything else (orders,
-- trade-ins, reviews, newsletter) is written by our server after it
-- checks the data, or by a logged-in admin.
-- =====================================================================
alter table settings enable row level security;
alter table categories enable row level security;
alter table brands enable row level security;
alter table products enable row level security;
alter table banners enable row level security;
alter table delivery_zones enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table trade_ins enable row level security;
alter table reviews enable row level security;
alter table newsletter_subscribers enable row level security;
alter table admins enable row level security;

-- Public read
drop policy if exists "public read" on settings;
create policy "public read" on settings for select using (true);
drop policy if exists "public read" on categories;
create policy "public read" on categories for select using (true);
drop policy if exists "public read" on brands;
create policy "public read" on brands for select using (true);
drop policy if exists "public read" on products;
create policy "public read" on products for select using (is_active or is_admin());
drop policy if exists "public read" on banners;
create policy "public read" on banners for select using (is_active or is_admin());
drop policy if exists "public read" on delivery_zones;
create policy "public read" on delivery_zones for select using (true);
drop policy if exists "public read" on reviews;
create policy "public read" on reviews for select using (approved or is_admin());

-- Admin full access
do $$
declare t text;
begin
  foreach t in array array['settings','categories','brands','products','banners','delivery_zones',
                           'orders','order_items','trade_ins','reviews','newsletter_subscribers'] loop
    execute format('drop policy if exists "admin all" on %I', t);
    execute format('create policy "admin all" on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

drop policy if exists "admin read self" on admins;
create policy "admin read self" on admins for select using (user_id = auth.uid());

-- =====================================================================
-- PHOTO STORAGE: a public "product-images" folder only admins can upload to
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "admin upload images" on storage.objects;
create policy "admin upload images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and is_admin());
drop policy if exists "admin update images" on storage.objects;
create policy "admin update images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and is_admin());
drop policy if exists "admin delete images" on storage.objects;
create policy "admin delete images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and is_admin());
