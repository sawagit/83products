// 新規アイテム作成（タイトルとカテゴリだけ。非公開・ステータス「アイデア」で始まる）
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createItem } from '../../../../lib/db';
import { checkSecrets } from '../../../../lib/guard';
import { fail, json, readJson, rejectForeign } from '../../../../lib/admin-api';

export const POST: APIRoute = async ({ request, url }) => {
  const bad = rejectForeign(request, url);
  if (bad) return bad;
  const body = await readJson(request);
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const category_id = Number(body.category_id);
  const parent = Number(body.parent_item_id);
  if (!title) return fail([{ field: 'title', reason: 'タイトルは必須です' }]);
  if (!Number.isInteger(category_id) || category_id <= 0) return fail([{ field: 'category_id', reason: 'カテゴリを選んでください' }]);
  const issues = checkSecrets({ title });
  if (issues.length) return fail(issues);
  const id = await createItem(env.DB, {
    category_id,
    title,
    parent_item_id: Number.isInteger(parent) && parent > 0 ? parent : null,
  });
  return json({ ok: true, id });
};
