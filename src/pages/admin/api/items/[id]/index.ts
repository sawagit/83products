// アイテムの 1 セクションを保存する（自動保存から呼ばれる）
// body: { section: 'basic' | 'dev' | 'links' | 'services' | 'tags' | 'tasks', data }
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import * as db from '../../../../../lib/db';
import * as api from '../../../../../lib/admin-api';

export const POST: APIRoute = async ({ request, url, params }) => {
  const bad = api.rejectForeign(request, url);
  if (bad) return bad;
  const id = api.parseId(params.id);
  if (!id) return new Response('Not Found', { status: 404 });
  const { section, data } = await api.readJson(request);

  try {
    switch (section) {
      case 'basic': {
        const r = api.parseBasic(data);
        if (!r.ok) return api.fail(r.errors);
        if (r.value.parent_item_id === id) return api.fail([{ field: 'parent_item_id', reason: '自分自身は親にできません' }]);
        await db.saveItemBasic(env.DB, id, r.value);
        break;
      }
      case 'dev': {
        const r = api.parseDev(data);
        if (!r.ok) return api.fail(r.errors);
        await db.saveItemDev(env.DB, id, r.value);
        break;
      }
      case 'links': {
        const r = api.parseLinks(data);
        if (!r.ok) return api.fail(r.errors);
        await db.replaceLinks(env.DB, id, r.value);
        break;
      }
      case 'services': {
        const r = api.parseServices(data);
        if (!r.ok) return api.fail(r.errors);
        await db.replaceItemServices(env.DB, id, r.value);
        break;
      }
      case 'tags': {
        const r = api.parseTags(data);
        if (!r.ok) return api.fail(r.errors);
        await db.replaceTags(env.DB, id, r.value);
        break;
      }
      case 'tasks': {
        const r = api.parseTasks(data);
        if (!r.ok) return api.fail(r.errors);
        await db.replaceTasks(env.DB, id, r.value);
        break;
      }
      default:
        return new Response('Bad Request', { status: 400 });
    }
  } catch (e) {
    const unique = api.uniqueError(e);
    if (unique) return api.fail(unique);
    throw e;
  }
  return api.json({ ok: true, savedAt: new Date().toISOString() });
};
