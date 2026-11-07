// 秘密情報ガード。
// 管理画面から保存されるすべての文字列をチェックし、APIキー・パスワード・個人情報らしきものを見つけたら保存を拒否する。
// このファイルは外部モジュールに依存しない（node --test で単体テストするため）。

export interface GuardIssue {
  field: string;
  reason: string;
}

const RULES: { reason: string; re: RegExp }[] = [
  { reason: '秘密鍵', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { reason: 'OpenAI / Anthropic の API キー', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { reason: 'Stripe のキー', re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { reason: 'GitHub トークン', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { reason: 'AWS アクセスキー', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { reason: 'Google API キー', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { reason: 'Slack トークン', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { reason: 'Discord Webhook URL', re: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i },
  { reason: 'JWT（認証トークン）', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    reason: 'パスワードやキーの値',
    re: /\b(?:password|passwd|pwd|passcode|secret|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token|token)\s*[:=]\s*["']?[^\s"']{4,}/i,
  },
  { reason: 'パスワードの値', re: /(?:パスワード|暗証番号)\s*[:：=]\s*\S{3,}/ },
  { reason: 'ユーザー名とパスワード入りの URL', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i },
  {
    reason: 'トークン入りの URL',
    re: /[?&](?:token|access_token|api_key|apikey|key|secret|sig|signature|auth|password)=[^&\s]{8,}/i,
  },
  { reason: 'メールアドレス', re: /\b(?!git@)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { reason: '電話番号', re: /(?:\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|(?<![\d-])0\d{1,4}-\d{1,4}-\d{3,4}(?![\d-])|(?<!\d)0[789]0\d{8}(?!\d))/ },
];

/** 1 つの文字列をチェックし、見つかった理由を返す（なければ null） */
export function findSecret(value: string): string | null {
  for (const rule of RULES) if (rule.re.test(value)) return rule.reason;
  return null;
}

/** オブジェクト（配列の入れ子も可）の文字列をすべてチェックする */
export function checkSecrets(data: unknown, path = ''): GuardIssue[] {
  if (typeof data === 'string') {
    const reason = findSecret(data);
    return reason ? [{ field: path || '(値)', reason: `${reason}らしき文字列が入っているので保存しません` }] : [];
  }
  if (Array.isArray(data)) return data.flatMap((v, i) => checkSecrets(v, `${path}[${i + 1}]`));
  if (data && typeof data === 'object') {
    return Object.entries(data).flatMap(([k, v]) => checkSecrets(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** リンクとして保存してよい URL か（http / https だけ。javascript: などは拒否） */
export function isSafeUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch {
    return false;
  }
}
