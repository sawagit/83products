// /admin 配下（ページも API も）を Cloudflare Access で保護する。
// Access のダッシュボード設定に加えて Worker 側でも JWT を検証するので、
// Access を迂回して Worker に直接届くリクエスト（例: *.workers.dev）も 403 になる。
import { defineMiddleware } from 'astro:middleware';
import { verifyAccess } from './lib/access';

export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith('/admin')) return next();

  const result = await verifyAccess(context.request);
  if (!result.ok) {
    const body =
      result.reason === 'not-configured'
        ? 'Admin is locked: CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are not configured.'
        : 'Forbidden';
    return new Response(body, { status: result.status });
  }
  context.locals.adminEmail = result.email;
  return next();
});
