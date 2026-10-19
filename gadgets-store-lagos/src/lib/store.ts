// Every page gets its data through these functions. If the database is not
// connected yet, they return the sample data so the site still works.

import { DEFAULT_SETTINGS } from '../config/defaults';
import { SAMPLE_BANNERS, SAMPLE_BRANDS, SAMPLE_CATEGORIES, SAMPLE_PRODUCTS } from '../data/samples';
import { publicClient } from './supabase';
import type { Banner, Brand, Category, Product, StoreSettings } from './types';

export type ProductSort = 'newest' | 'price-asc' | 'price-desc' | 'discount';

export interface ProductQuery {
  category?: string;
  brand?: string;
  featured?: boolean;
  onSale?: boolean;
  sort?: ProductSort;
  limit?: number;
  excludeId?: string;
}

function logError(where: string, error: unknown) {
  console.error(`[store] ${where} failed:`, error);
}

export async function getSettings(): Promise<StoreSettings> {
  const db = publicClient();
  if (!db) return DEFAULT_SETTINGS;
  const { data, error } = await db.from('settings').select('*').eq('id', 1).maybeSingle();
  if (error) logError('getSettings', error);
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

export async function getCategories(): Promise<Category[]> {
  const db = publicClient();
  if (!db) return SAMPLE_CATEGORIES;
  const { data, error } = await db.from('categories').select('*').order('sort_order');
  if (error) logError('getCategories', error);
  return data ?? [];
}

export async function getBrands(): Promise<Brand[]> {
  const db = publicClient();
  if (!db) return SAMPLE_BRANDS;
  const { data, error } = await db.from('brands').select('*').order('name');
  if (error) logError('getBrands', error);
  return data ?? [];
}

export async function getBanners(): Promise<Banner[]> {
  const db = publicClient();
  if (!db) return SAMPLE_BANNERS;
  const { data, error } = await db.from('banners').select('*').eq('is_active', true).order('sort_order');
  if (error) logError('getBanners', error);
  return data ?? [];
}

const discountOf = (p: Product) => (p.compare_at_price ? p.compare_at_price - p.price : 0);

function sortProducts(list: Product[], sort: ProductSort): Product[] {
  const copy = [...list];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return copy.sort((a, b) => b.price - a.price);
    case 'discount':
      return copy.sort((a, b) => discountOf(b) - discountOf(a));
    default:
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export async function getProducts(q: ProductQuery = {}): Promise<Product[]> {
  const sort = q.sort ?? 'newest';
  const db = publicClient();

  if (!db) {
    let list = SAMPLE_PRODUCTS.filter((p) => p.is_active);
    if (q.category) list = list.filter((p) => p.category === q.category);
    if (q.brand) list = list.filter((p) => p.brand === q.brand);
    if (q.featured) list = list.filter((p) => p.featured);
    if (q.onSale) list = list.filter((p) => discountOf(p) > 0);
    if (q.excludeId) list = list.filter((p) => p.id !== q.excludeId);
    list = sortProducts(list, sort);
    return q.limit ? list.slice(0, q.limit) : list;
  }

  let query = db.from('products').select('*').eq('is_active', true);
  if (q.category) query = query.eq('category', q.category);
  if (q.brand) query = query.eq('brand', q.brand);
  if (q.featured) query = query.eq('featured', true);
  if (q.onSale) query = query.not('compare_at_price', 'is', null);
  if (q.excludeId) query = query.neq('id', q.excludeId);
  if (sort === 'price-asc') query = query.order('price', { ascending: true });
  else if (sort === 'price-desc') query = query.order('price', { ascending: false });
  else query = query.order('created_at', { ascending: false });
  if (q.limit && sort !== 'discount') query = query.limit(q.limit);

  const { data, error } = await query;
  if (error) logError('getProducts', error);
  let list = (data ?? []) as Product[];
  if (q.onSale) list = list.filter((p) => discountOf(p) > 0);
  if (sort === 'discount') {
    list = sortProducts(list, 'discount');
    if (q.limit) list = list.slice(0, q.limit);
  }
  return list;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const db = publicClient();
  if (!db) return SAMPLE_PRODUCTS.find((p) => p.slug === slug && p.is_active) ?? null;
  const { data, error } = await db.from('products').select('*').eq('slug', slug).eq('is_active', true).maybeSingle();
  if (error) logError('getProductBySlug', error);
  return (data as Product) ?? null;
}
