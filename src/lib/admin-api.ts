// 管理 API の共通処理：リクエストの検査、入力の整形、秘密情報ガード。
// 認証（Cloudflare Access）は src/middleware.ts が /admin 配下すべてで済ませている。
import { checkSecrets, isSafeUrl, type GuardIssue } from './guard';
import {
  ITEM_STATUSES,
  LINK_KINDS,
  slugify,
  type CategoryInput,
  type ItemBasic,
  type ItemDev,
  type ItemLink,
  type ItemService,
  type ItemStatus,
  type ItemTask,
  type LinkKind,
} from './db';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export const fail = (errors: GuardIssue[], status = 422) => json({ ok: false, errors }, status);

/**
 * 他サイトからの書き込み（CSRF）を防ぐ。
 * JSON は Content-Type: application/json 必須（ブラウザのフォーム送信では作れない）、
 * さらに Origin ヘッダーがあれば自サイトと一致することを確認する。
 */
export function rejectForeign(request: Request, url: URL, { allowMultipart = false } = {}): Response | null {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
  const type = request.headers.get('content-type') ?? '';
  const ok = type.startsWith('application/json') || (allowMultipart && type.startsWith('multipart/form-data'));
  return ok ? null : new Response('Unsupported Media Type', { status: 415 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const parseId = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ---------- 入力の整形 ----------

class Issues {
  list: GuardIssue[] = [];
  add(field: string, reason: string) {
    this.list.push({ field, reason });
  }
}

const text = (v: unknown, max = 20000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optText = (v: unknown, max = 20000) => text(v, max) || null;
const bool = (v: unknown) => (v === true || v === 1 || v === '1' || v === 'on' ? 1 : 0);
const int = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const optId = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isInteger(n) && n > 0 ? n : null;
};
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function url(v: unknown, field: string, issues: Issues): string | null {
  const s = text(v, 2000);
  if (!s) return null;
  if (!isSafeUrl(s)) issues.add(field, 'http:// か https:// で始まる URL を入れてください');
  return s;
}

function date(v: unknown, field: string, issues: Issues): string | null {
  const s = text(v, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(s)) issues.add(field, '日付は YYYY-MM-DD か YYYY-MM で入れてください');
  return s;
}

function slug(v: unknown, fallbackFrom: string, field: string, issues: Issues): string {
  const s = slugify(text(v, 120)) || slugify(fallbackFrom);
  if (!s) issues.add(field, 'URL 用の名前（slug）を入れてください');
  return s;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; errors: GuardIssue[] };

/** 整形した値に秘密情報ガードをかけて結果を返す */
function finish<T>(value: T, issues: Issues): Parsed<T> {
  const errors = [...issues.list, ...checkSecrets(value)];
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function parseBasic(data: unknown): Parsed<ItemBasic> {
  const d = obj(data);
  const issues = new Issues();
  const title = text(d.title, 200);
  if (!title) issues.add('title', 'タイトルは必須です');
  const category_id = optId(d.category_id);
  if (!category_id) issues.add('category_id', 'カテゴリを選んでください');
  const status = (ITEM_STATUSES as readonly string[]).includes(String(d.status)) ? (d.status as ItemStatus) : 'idea';
  return finish(
    {
      title,
      slug: slug(d.slug, title, 'slug', issues),
      public_code: optText(d.public_code, 40),
      summary: optText(d.summary, 500),
      body_md: optText(d.body_md),
      category_id: category_id ?? 0,
      parent_item_id: optId(d.parent_item_id),
      status,
      released_on: date(d.released_on, 'released_on', issues),
      featured: bool(d.featured),
      sort_order: int(d.sort_order),
      thumbnail_url: url(d.thumbnail_url, 'thumbnail_url', issues),
    },
    issues,
  );
}

export function parseDev(data: unknown): Parsed<ItemDev> {
  const d = obj(data);
  const issues = new Issues();
  return finish(
    {
      repo_url: url(d.repo_url, 'repo_url', issues),
      preview_url: url(d.preview_url, 'preview_url', issues),
      prod_url: url(d.prod_url, 'prod_url', issues),
      tech_stack: optText(d.tech_stack, 500),
      dev_notes_md: optText(d.dev_notes_md),
    },
    issues,
  );
}

export function parseLinks(data: unknown): Parsed<ItemLink[]> {
  const issues = new Issues();
  const links = arr(data)
    .map(obj)
    .filter((l) => text(l.url))
    .slice(0, 50)
    .map((l, i) => ({
      kind: ((LINK_KINDS as readonly string[]).includes(String(l.kind)) ? l.kind : 'other') as LinkKind,
      label: optText(l.label, 100),
      url: url(l.url, `links[${i + 1}].url`, issues) ?? '',
      is_public: bool(l.is_public),
    }));
  return finish(links, issues);
}

export function parseServices(data: unknown): Parsed<ItemService[]> {
  const issues = new Issues();
  const seen = new Set<string>();
  const services = arr(data)
    .map(obj)
    .filter((s) => text(s.name))
    .slice(0, 50)
    .map((s, i) => ({
      name: text(s.name, 80),
      role: optText(s.role, 80),
      console_url: url(s.console_url, `services[${i + 1}].console_url`, issues),
    }))
    .filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
  return finish(services, issues);
}

export function parseTags(data: unknown): Parsed<string[]> {
  const raw = Array.isArray(data) ? data : text(data).split(/[,、]/);
  const tags = [...new Set(raw.map((t) => text(t, 40)).filter(Boolean))].slice(0, 30);
  return finish(tags, new Issues());
}

export function parseTasks(data: unknown): Parsed<ItemTask[]> {
  const tasks = arr(data)
    .map(obj)
    .filter((t) => text(t.text))
    .slice(0, 100)
    .map((t) => ({ text: text(t.text, 300), done: bool(t.done) }));
  return finish(tasks, new Issues());
}

export function parseCategory(data: unknown): Parsed<CategoryInput> {
  const d = obj(data);
  const issues = new Issues();
  const name = text(d.name, 60);
  if (!name) issues.add('name', '表示名は必須です');
  const color = text(d.color, 7);
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) issues.add('color', '色は #rrggbb で入れてください');
  return finish(
    {
      parent_id: optId(d.parent_id),
      slug: slug(d.slug, text(d.name_en) || name, 'slug', issues),
      name,
      name_en: optText(d.name_en, 60),
      description: optText(d.description, 500),
      icon: optText(d.icon, 40),
      color: color || null,
      sort_order: int(d.sort_order),
    },
    issues,
  );
}

export function parseService(data: unknown): Parsed<{ name: string; dashboard_url: string | null; notes: string | null }> {
  const d = obj(data);
  const issues = new Issues();
  const name = text(d.name, 80);
  if (!name) issues.add('name', 'サービス名は必須です');
  return finish({ name, dashboard_url: url(d.dashboard_url, 'dashboard_url', issues), notes: optText(d.notes, 1000) }, issues);
}

/** D1 の一意制約違反を、画面に出せるメッセージにする */
export function uniqueError(e: unknown): GuardIssue[] | null {
  const msg = String((e as Error)?.message ?? e);
  if (!msg.includes('UNIQUE')) return null;
  if (msg.includes('public_code')) return [{ field: 'public_code', reason: 'この公開ID はもう使われています' }];
  if (msg.includes('slug')) return [{ field: 'slug', reason: 'この slug はもう使われています' }];
  if (msg.includes('name')) return [{ field: 'name', reason: 'この名前はもう使われています' }];
  return [{ field: '(保存)', reason: '同じ値がもう使われています' }];
}
