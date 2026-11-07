// サムネイル画像のアップロード（multipart の file）と削除（JSON { remove: true }）。実体は R2。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { mediaBucket } from '../../../../../lib/media';
import { mediaUrl, setItemThumbnail } from '../../../../../lib/db';
import { fail, json, parseId, readJson, rejectForeign } from '../../../../../lib/admin-api';

const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
const MAX_BYTES = 5 * 1024 * 1024;

export const POST: APIRoute = async ({ request, url, params }) => {
  const bad = rejectForeign(request, url, { allowMultipart: true });
  if (bad) return bad;
  const id = parseId(params.id);
  if (!id) return new Response('Not Found', { status: 404 });

  const bucket = mediaBucket();
  let key: string | null = null;
  if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    if (!bucket) return fail([{ field: 'file', reason: 'R2 が未設定なのでアップロードできません。画像 URL 欄を使ってください' }], 503);
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return fail([{ field: 'file', reason: '画像を選んでください' }]);
    const ext = TYPES[file.type];
    if (!ext) return fail([{ field: 'file', reason: 'PNG / JPEG / WebP / GIF / AVIF だけアップロードできます' }]);
    if (file.size > MAX_BYTES) return fail([{ field: 'file', reason: '5MB 以下の画像にしてください' }]);
    key = `items/${id}/thumb-${Date.now().toString(36)}.${ext}`;
    await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  } else {
    const body = await readJson(request);
    if (body.remove !== true) return new Response('Bad Request', { status: 400 });
  }

  const prev = await setItemThumbnail(env.DB, id, key);
  if (prev && prev !== key) await bucket?.delete(prev);
  return json({ ok: true, key, url: mediaUrl(key, true) });
};
