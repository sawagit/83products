import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createCategory } from '../../../../lib/db';
import { fail, json, parseCategory, readJson, rejectForeign, uniqueError } from '../../../../lib/admin-api';

export const POST: APIRoute = async ({ request, url }) => {
  const bad = rejectForeign(request, url);
  if (bad) return bad;
  const r = parseCategory(await readJson(request));
  if (!r.ok) return fail(r.errors);
  try {
    return json({ ok: true, id: await createCategory(env.DB, r.value) });
  } catch (e) {
    const unique = uniqueError(e);
    if (unique) return fail(unique);
    throw e;
  }
};
