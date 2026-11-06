import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createItem, slugify } from '../../../lib/db';

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const opt = (v: FormDataEntryValue | null) => str(v) || null;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const title = str(form.get('title'));
  const category_id = Number(form.get('category_id'));
  if (!title || !Number.isInteger(category_id)) return new Response('Bad Request', { status: 400 });

  // slug は重複しないように短い乱数を付ける
  const slug = `${slugify(title) || 'item'}-${Math.random().toString(36).slice(2, 6)}`;

  await createItem(env.DB, {
    category_id,
    slug,
    title,
    summary: str(form.get('summary')),
    public_url: opt(form.get('public_url')),
    dev_notes: str(form.get('dev_notes')),
    repo_url: opt(form.get('repo_url')),
    preview_url: opt(form.get('preview_url')),
    services: str(form.get('services')),
  });
  return redirect(`/admin?msg=${encodeURIComponent(`「${title}」を非公開で追加しました`)}`, 303);
};
