import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { deleteItem } from '../../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const id = Number(form.get('id'));
  if (!Number.isInteger(id)) return new Response('Bad Request', { status: 400 });

  await deleteItem(env.DB, id);
  return redirect(`/admin?msg=${encodeURIComponent('削除しました')}`, 303);
};
