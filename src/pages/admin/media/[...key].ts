// 管理画面用の画像配信（非公開の画像も見られる。/admin 配下なので Access で保護される）
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params }) => {
  const obj = params.key ? await env.MEDIA.get(params.key) : null;
  if (!obj) return new Response('Not Found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, max-age=60');
  return new Response(obj.body, { headers });
};
