// Cloudflare Access の JWT 検証ヘルパー。
// middleware が /admin 配下すべて（ページも API も）に対して呼ぶ。
// 個別の API ルートで追加で確認したい場合も、この関数をそのまま使える。
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from 'cloudflare:workers';

export type AccessResult =
  | { ok: true; email: string }
  | { ok: false; status: 403; reason: 'not-configured' | 'missing-token' | 'invalid-token' };

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * リクエストが Cloudflare Access を通過してきたことを検証する。
 * - `Cf-Access-Jwt-Assertion` ヘッダー（または CF_Authorization クッキー）の JWT を
 *   チームの公開鍵で署名検証し、issuer と AUD が一致することを確認する。
 * - ローカル開発では .dev.vars の ALLOW_UNAUTHENTICATED_ADMIN=true で素通りできる。
 */
export async function verifyAccess(request: Request): Promise<AccessResult> {
  if (env.ALLOW_UNAUTHENTICATED_ADMIN === 'true') return { ok: true, email: 'local-dev' };

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!teamDomain || !aud) return { ok: false, status: 403, reason: 'not-configured' };

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ?? readCookie(request, 'CF_Authorization');
  if (!token) return { ok: false, status: 403, reason: 'missing-token' };

  try {
    const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience: aud,
    });
    return { ok: true, email: typeof payload.email === 'string' ? payload.email : 'unknown' };
  } catch {
    return { ok: false, status: 403, reason: 'invalid-token' };
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
