import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { deleteCategory } from '../../../../../lib/db';
import { fail, json, parseId, rejectForeign } from '../../../../../lib/admin-api';

export const POST: APIRoute = async ({ request, url, params }) => {
  const bad = rejectForeign(request, url);
  if (bad) return bad;
  const id = parseId(params.id);
  if (!id) return new Response('Not Found', { status: 404 });
  const r = await deleteCategory(env.DB, id);
  if (r === 'not-empty') return fail([{ field: 'category', reason: '中にアイテムか子カテゴリがあるので削除できません' }]);
  return json({ ok: true });
};
