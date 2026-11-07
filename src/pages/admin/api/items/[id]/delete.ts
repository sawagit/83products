import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { deleteItem } from '../../../../../lib/db';
import { json, parseId, rejectForeign } from '../../../../../lib/admin-api';

export const POST: APIRoute = async ({ request, url, params }) => {
  const bad = rejectForeign(request, url);
  if (bad) return bad;
  const id = parseId(params.id);
  if (!id) return new Response('Not Found', { status: 404 });
  const key = await deleteItem(env.DB, id);
  if (key) await env.MEDIA.delete(key);
  return json({ ok: true });
};
