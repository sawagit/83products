import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { setPublished } from '../../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const id = Number(form.get('id'));
  const published = form.get('published') === '1';
  if (!Number.isInteger(id)) return new Response('Bad Request', { status: 400 });

  await setPublished(env.DB, id, published);
  return redirect(`/admin?msg=${encodeURIComponent(published ? '公開しました' : '非公開にしました')}`, 303);
};
