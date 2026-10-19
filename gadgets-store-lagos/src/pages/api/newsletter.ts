import type { APIRoute } from 'astro';
import { serviceClient } from '../../lib/supabase';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) {
    return Response.json({ message: 'Please enter a valid email address.' }, { status: 400 });
  }

  const db = serviceClient();
  if (db) {
    const { error } = await db.from('newsletter_subscribers').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) {
      console.error('[newsletter]', error);
      return Response.json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }
  return Response.json({ message: "You're subscribed! Watch your inbox for deals." });
};
