import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSecret } from 'astro:env/server';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** True once the Supabase keys have been added. Until then the site shows sample data. */
export function isDatabaseConnected(): boolean {
  return Boolean(getSecret('SUPABASE_URL') && getSecret('SUPABASE_ANON_KEY'));
}

/** Client with public (read-only) access. Database rules decide what it can see. */
export function publicClient(): SupabaseClient | null {
  const url = getSecret('SUPABASE_URL');
  const key = getSecret('SUPABASE_ANON_KEY');
  return url && key ? createClient(url, key, noSession) : null;
}

/**
 * Client with full access. ONLY use on the server (never send it to the
 * browser), e.g. to save orders after checking a payment.
 */
export function serviceClient(): SupabaseClient | null {
  const url = getSecret('SUPABASE_URL');
  const key = getSecret('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? createClient(url, key, noSession) : null;
}
