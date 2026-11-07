import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecret, checkSecrets, isSafeUrl } from '../src/lib/guard.ts';

const bad = [
  'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
  'sk-ant-api03-abcdefghijklmnopqrstuvwx',
  'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  'github_pat_11ABCDEFG0123456789_abcdefghijklmnop',
  'AKIAIOSFODNN7EXAMPLE',
  'AIzaSyA-abcdefghijklmnopqrstuvwxyz12345',
  'xoxb-1234567890-abcdefghij',
  'sk_live_abcdefghijklmnop1234',
  'https://discord.com/api/webhooks/123456/abcDEF-ghi',
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'password=hunter22',
  'API_KEY: abcd1234',
  'パスワード：abc123',
  'https://user:pass@example.com/repo',
  'https://example.com/x?token=abcdef123456',
  'contact me at someone@example.com',
  '電話 03-1234-5678',
  '09012345678',
  '+81 90 1234 5678',
  '-----BEGIN OPENSSH PRIVATE KEY-----',
];
const good = [
  'https://github.com/sawagit/83products',
  'git@github.com:sawagit/83products.git',
  'Astro, Three.js, Cloudflare D1',
  'リリース 2026-11-07 予定',
  'Steam のストアページ https://store.steampowered.com/app/123456/',
  'Vercel と Supabase を使用。キーは 1Password に保管',
  'token の更新処理を直す',
  'https://83products-git-feature.pages.dev/?ref=abc',
  'v1.2.3 / build 20261107',
];

test('秘密情報らしき文字列を検出する', () => {
  for (const s of bad) assert.ok(findSecret(s), `検出されるべき: ${s}`);
});

test('普通の開発メモは通す', () => {
  for (const s of good) assert.equal(findSecret(s), null, `通るべき: ${s}`);
});

test('入れ子のフィールド名を返す', () => {
  const issues = checkSecrets({ title: 'ok', links: [{ url: 'https://a.com' }, { url: 'https://x.com/?key=abcdefgh1234' }] });
  assert.deepEqual(issues, [{ field: 'links[2].url', reason: 'トークン入りの URLらしき文字列が入っているので保存しません' }]);
});

test('URL は http/https だけ許可', () => {
  assert.ok(isSafeUrl('https://example.com'));
  assert.ok(!isSafeUrl('javascript:alert(1)'));
  assert.ok(!isSafeUrl('https://u:p@example.com'));
  assert.ok(!isSafeUrl('not a url'));
});
