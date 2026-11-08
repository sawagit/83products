// 公開画像の配信。公開中のアイテムに紐づく R2 キーだけを返し、それ以外は 404。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isPublicMediaKey } from '../../lib/db';
import { mediaBucket } from '../../lib/media';

export const GET: APIRoute = async ({ params }) => {
  const key = params.key;
  const bucket = mediaBucket();
  if (!key || !bucket || !(await isPublicMediaKey(env.DB, key))) return new Response('Not Found', { status: 404 });
  const obj = await bucket.get(key);
  if (!obj) return new Response('Not Found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  // キーはアップロードごとに変わるので長くキャッシュしてよいが、非公開化を早く反映するため 1 時間にとどめる
  headers.set('cache-control', 'public, max-age=3600');
  return new Response(obj.body, { headers });
};
