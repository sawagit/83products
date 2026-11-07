import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { saveService } from '../../../../../lib/db';
import { fail, json, parseId, parseService, readJson, rejectForeign, uniqueError } from '../../../../../lib/admin-api';

export const POST: APIRoute = async ({ request, url, params }) => {
  const bad = rejectForeign(request, url);
  if (bad) return bad;
  const id = parseId(params.id);
  if (!id) return new Response('Not Found', { status: 404 });
  const r = parseService(await readJson(request));
  if (!r.ok) return fail(r.errors);
  try {
    await saveService(env.DB, id, r.value);
  } catch (e) {
    const unique = uniqueError(e);
    if (unique) return fail(unique);
    throw e;
  }
  return json({ ok: true, savedAt: new Date().toISOString() });
};
