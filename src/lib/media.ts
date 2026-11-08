// R2（画像置き場）はオプション。wrangler.jsonc に MEDIA バインディングがあるときだけ使う。
// 無い場合はアップロードを止め、サムネは外部の画像 URL で指定する。
import { env } from 'cloudflare:workers';

export function mediaBucket(): R2Bucket | null {
  return (env as unknown as { MEDIA?: R2Bucket }).MEDIA ?? null;
}
