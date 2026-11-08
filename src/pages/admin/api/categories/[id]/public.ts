import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { setCategoryPublic } from '../../../../../lib/db';
import { json, parseId, readJson, rejectForeign } from '../../../../../lib/admin-api';

export const POST: APIRoute = async ({ request, url, params }) => {
  const bad = rejectForeign(request, url);
  if (bad) return bad;
  const id = parseId(params.id);
  if (!id) return new Response('Not Found', { status: 404 });
  const { is_public } = await readJson(request);
  await setCategoryPublic(env.DB, id, is_public === true);
  return json({ ok: true, is_public: is_public === true });
};
