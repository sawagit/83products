import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { saveCategory } from '../../../../../lib/db';
import { fail, json, parseCategory, parseId, readJson, rejectForeign, uniqueError } from '../../../../../lib/admin-api';

export const POST: APIRoute = async ({ request, url, params }) => {
  const bad = rejectForeign(request, url);
  if (bad) return bad;
  const id = parseId(params.id);
  if (!id) return new Response('Not Found', { status: 404 });
  const r = parseCategory(await readJson(request));
  if (!r.ok) return fail(r.errors);
  if (r.value.parent_id === id) return fail([{ field: 'parent_id', reason: '自分自身は親にできません' }]);
  // 入れ子は 2 階層まで：親に選べるのは最上位のカテゴリだけ、子を持つカテゴリは親を持てない
  if (r.value.parent_id) {
    const p = await env.DB.prepare('SELECT parent_id FROM categories WHERE id = ?1').bind(r.value.parent_id).first<{ parent_id: number | null }>();
    const kids = await env.DB.prepare('SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?1').bind(id).first<{ n: number }>();
    if (!p || p.parent_id !== null || (kids?.n ?? 0) > 0) {
      return fail([{ field: 'parent_id', reason: 'カテゴリの入れ子は 2 階層までです' }]);
    }
  }
  try {
    await saveCategory(env.DB, id, r.value);
  } catch (e) {
    const unique = uniqueError(e);
    if (unique) return fail(unique);
    throw e;
  }
  return json({ ok: true, savedAt: new Date().toISOString() });
};
