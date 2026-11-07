// D1 アクセス層。
// - 公開ページ用の関数は v_public_* ビューだけを読む（非公開テーブルを参照しない）。
// - 管理画面用の関数はすべてのテーブルを読み書きする。/admin 配下からだけ呼ぶこと。

// ---------- 共通 ----------

export const ITEM_STATUSES = ['idea', 'dev', 'live', 'paused', 'archived'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const STATUS_LABELS: Record<ItemStatus, string> = {
  idea: 'アイデア',
  dev: '開発中',
  live: '公開中',
  paused: '休止',
  archived: 'アーカイブ',
};

export const LINK_KINDS = ['web', 'store', 'youtube', 'x', 'discord', 'github', 'docs', 'other'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** 公開ページでのステータス（v_public_items が変換済み） */
export type PublicStatus = 'live' | 'wip' | 'archive';

/** R2 のキーから画像 URL を作る（公開側は /media、管理側は /admin/media） */
export const mediaUrl = (key: string | null, admin = false) =>
  key ? `${admin ? '/admin/media' : '/media'}/${key.split('/').map(encodeURIComponent).join('/')}` : null;

/** サムネの表示 URL：アップロード画像（R2）があればそれ、なければ外部 URL */
export const thumbnailSrc = (key: string | null, externalUrl: string | null, admin = false) =>
  mediaUrl(key, admin) ?? externalUrl ?? null;

// ---------- 公開ページ用（v_public_* だけを読む） ----------

export interface PublicCategory {
  id: number;
  parent_id: number | null;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
}

export interface PublicItem {
  id: number;
  category_id: number;
  parent_item_id: number | null;
  slug: string;
  public_code: string | null;
  title: string;
  summary: string | null;
  body_md: string | null;
  status: PublicStatus;
  released_on: string | null;
  featured: number;
  sort_order: number;
  published_at: string | null;
  primary_url: string | null;
  thumbnail_url: string | null;
}

export interface PublicLink {
  id: number;
  item_id: number;
  kind: LinkKind;
  label: string | null;
  url: string;
  sort_order: number;
}

export interface CategoryWithItems<T> extends PublicCategory {
  items: T[];
}

const DEFAULT_COLOR = '#5b6cff';

/** 公開ページ：公開中のカテゴリと、その中の公開アイテムだけ */
export async function getPublishedTree(db: D1Database): Promise<CategoryWithItems<PublicItem>[]> {
  const [cats, items] = await db.batch([
    db.prepare('SELECT * FROM v_public_categories ORDER BY sort_order, id'),
    db.prepare(
      `SELECT id, category_id, parent_item_id, slug, public_code, title, summary, body_md,
              public_status AS status, released_on, featured, sort_order, published_at,
              primary_url, thumbnail_key, thumbnail_url AS thumbnail_ext
         FROM v_public_items ORDER BY category_id, sort_order, id`,
    ),
  ]);
  const publicItems = (
    items.results as (Omit<PublicItem, 'thumbnail_url'> & { thumbnail_key: string | null; thumbnail_ext: string | null })[]
  ).map(({ thumbnail_key, thumbnail_ext, ...rest }) => ({ ...rest, thumbnail_url: thumbnailSrc(thumbnail_key, thumbnail_ext) }));
  return (cats.results as PublicCategory[]).map((c) => ({
    ...c,
    color: c.color || DEFAULT_COLOR,
    items: publicItems.filter((i) => i.category_id === c.id),
  }));
}

/** 公開ページ：1 アイテムの公開リンク */
export async function getPublicLinks(db: D1Database, itemId: number): Promise<PublicLink[]> {
  const { results } = await db
    .prepare('SELECT * FROM v_public_links WHERE item_id = ?1 ORDER BY sort_order, id')
    .bind(itemId)
    .all<PublicLink>();
  return results;
}

/** /media 配信用：そのキーが公開中のアイテムの画像かどうか */
export async function isPublicMediaKey(db: D1Database, key: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM v_public_items WHERE thumbnail_key = ?1
       UNION SELECT 1 FROM v_public_media WHERE r2_key = ?1 LIMIT 1`,
    )
    .bind(key)
    .first();
  return row !== null;
}

// ---------- 管理画面用 ----------

export interface Category extends PublicCategory {
  is_public: number;
}

export interface AdminItemRow {
  id: number;
  category_id: number;
  parent_item_id: number | null;
  slug: string;
  public_code: string | null;
  title: string;
  summary: string | null;
  status: ItemStatus;
  is_public: number;
  featured: number;
  sort_order: number;
  thumbnail_key: string | null;
  thumbnail_url: string | null;
  updated_at: string;
}

export interface AdminItem extends AdminItemRow {
  body_md: string | null;
  released_on: string | null;
  published_at: string | null;
  created_at: string;
}

export interface ItemDev {
  repo_url: string | null;
  preview_url: string | null;
  prod_url: string | null;
  tech_stack: string | null;
  dev_notes_md: string | null;
}

export interface ItemLink {
  kind: LinkKind;
  label: string | null;
  url: string;
  is_public: number;
}

export interface ItemService {
  name: string;
  role: string | null;
  console_url: string | null;
}

export interface ItemTask {
  text: string;
  done: number;
}

export interface ItemDetail {
  item: AdminItem;
  dev: ItemDev;
  links: ItemLink[];
  services: ItemService[];
  tags: string[];
  tasks: ItemTask[];
}

export interface Service {
  id: number;
  name: string;
  dashboard_url: string | null;
  notes: string | null;
  item_count: number;
}

const ADMIN_ROW_COLUMNS =
  'id, category_id, parent_item_id, slug, public_code, title, summary, status, is_public, featured, sort_order, thumbnail_key, thumbnail_url, updated_at';

export async function getAdminTree(db: D1Database) {
  const [cats, items] = await db.batch([
    db.prepare('SELECT * FROM categories ORDER BY sort_order, id'),
    db.prepare(`SELECT ${ADMIN_ROW_COLUMNS} FROM items ORDER BY sort_order, id`),
  ]);
  return { categories: cats.results as Category[], items: items.results as AdminItemRow[] };
}

export async function getItemDetail(db: D1Database, id: number): Promise<ItemDetail | null> {
  const [item, dev, links, services, tags, tasks] = await db.batch([
    db.prepare('SELECT * FROM items WHERE id = ?1').bind(id),
    db.prepare('SELECT repo_url, preview_url, prod_url, tech_stack, dev_notes_md FROM item_dev WHERE item_id = ?1').bind(id),
    db.prepare('SELECT kind, label, url, is_public FROM item_links WHERE item_id = ?1 ORDER BY sort_order, id').bind(id),
    db
      .prepare(
        `SELECT s.name, x.role, x.console_url FROM item_services x JOIN services s ON s.id = x.service_id
          WHERE x.item_id = ?1 ORDER BY s.name`,
      )
      .bind(id),
    db.prepare('SELECT t.name FROM item_tags x JOIN tags t ON t.id = x.tag_id WHERE x.item_id = ?1 ORDER BY t.name').bind(id),
    db.prepare('SELECT text, done FROM item_tasks WHERE item_id = ?1 ORDER BY sort_order, id').bind(id),
  ]);
  const row = item.results[0] as AdminItem | undefined;
  if (!row) return null;
  return {
    item: row,
    dev: (dev.results[0] as ItemDev | undefined) ?? {
      repo_url: null,
      preview_url: null,
      prod_url: null,
      tech_stack: null,
      dev_notes_md: null,
    },
    links: links.results as ItemLink[],
    services: services.results as ItemService[],
    tags: (tags.results as { name: string }[]).map((t) => t.name),
    tasks: tasks.results as ItemTask[],
  };
}

export async function createItem(db: D1Database, input: { category_id: number; title: string; parent_item_id?: number | null }) {
  const slug = `${slugify(input.title) || 'item'}-${Math.random().toString(36).slice(2, 6)}`;
  const row = await db
    .prepare('INSERT INTO items (category_id, parent_item_id, slug, title) VALUES (?1, ?2, ?3, ?4) RETURNING id')
    .bind(input.category_id, input.parent_item_id ?? null, slug, input.title)
    .first<{ id: number }>();
  return row!.id;
}

export interface ItemBasic {
  title: string;
  slug: string;
  public_code: string | null;
  summary: string | null;
  body_md: string | null;
  category_id: number;
  parent_item_id: number | null;
  status: ItemStatus;
  released_on: string | null;
  featured: number;
  sort_order: number;
  thumbnail_url: string | null;
}

export async function saveItemBasic(db: D1Database, id: number, b: ItemBasic) {
  await db
    .prepare(
      `UPDATE items SET title = ?2, slug = ?3, public_code = ?4, summary = ?5, body_md = ?6, category_id = ?7,
              parent_item_id = ?8, status = ?9, released_on = ?10, featured = ?11, sort_order = ?12,
              thumbnail_url = ?13, updated_at = datetime('now')
        WHERE id = ?1`,
    )
    .bind(id, b.title, b.slug, b.public_code, b.summary, b.body_md, b.category_id, b.parent_item_id, b.status, b.released_on, b.featured, b.sort_order, b.thumbnail_url)
    .run();
}

export async function saveItemDev(db: D1Database, id: number, d: ItemDev) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO item_dev (item_id, repo_url, preview_url, prod_url, tech_stack, dev_notes_md, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
         ON CONFLICT(item_id) DO UPDATE SET repo_url = ?2, preview_url = ?3, prod_url = ?4, tech_stack = ?5,
           dev_notes_md = ?6, updated_at = datetime('now')`,
      )
      .bind(id, d.repo_url, d.preview_url, d.prod_url, d.tech_stack, d.dev_notes_md),
    touch(db, id),
  ]);
}

export async function replaceLinks(db: D1Database, id: number, links: ItemLink[]) {
  await db.batch([
    db.prepare('DELETE FROM item_links WHERE item_id = ?1').bind(id),
    ...links.map((l, i) =>
      db
        .prepare('INSERT INTO item_links (item_id, kind, label, url, is_public, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(id, l.kind, l.label, l.url, l.is_public, i),
    ),
    touch(db, id),
  ]);
}

export async function replaceTasks(db: D1Database, id: number, tasks: ItemTask[]) {
  await db.batch([
    db.prepare('DELETE FROM item_tasks WHERE item_id = ?1').bind(id),
    ...tasks.map((t, i) =>
      db.prepare('INSERT INTO item_tasks (item_id, text, done, sort_order) VALUES (?1, ?2, ?3, ?4)').bind(id, t.text, t.done, i),
    ),
    touch(db, id),
  ]);
}

export async function replaceTags(db: D1Database, id: number, tags: string[]) {
  await db.batch([
    ...tags.map((name) => db.prepare('INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING').bind(name)),
    db.prepare('DELETE FROM item_tags WHERE item_id = ?1').bind(id),
    ...tags.map((name) =>
      db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?1, id FROM tags WHERE name = ?2').bind(id, name),
    ),
    db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM item_tags)'),
    touch(db, id),
  ]);
}

/** サービスは名前で紐づける。台帳にない名前は自動で追加する */
export async function replaceItemServices(db: D1Database, id: number, services: ItemService[]) {
  await db.batch([
    ...services.map((s) => db.prepare('INSERT INTO services (name) VALUES (?1) ON CONFLICT(name) DO NOTHING').bind(s.name)),
    db.prepare('DELETE FROM item_services WHERE item_id = ?1').bind(id),
    ...services.map((s) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO item_services (item_id, service_id, role, console_url)
           SELECT ?1, id, ?3, ?4 FROM services WHERE name = ?2`,
        )
        .bind(id, s.name, s.role, s.console_url),
    ),
    touch(db, id),
  ]);
}

export async function setItemPublic(db: D1Database, id: number, isPublic: boolean) {
  await db
    .prepare(
      `UPDATE items
          SET is_public = ?2,
              published_at = CASE WHEN ?2 = 1 AND published_at IS NULL THEN datetime('now') ELSE published_at END,
              updated_at = datetime('now')
        WHERE id = ?1`,
    )
    .bind(id, isPublic ? 1 : 0)
    .run();
}

export async function setItemThumbnail(db: D1Database, id: number, key: string | null) {
  const prev = await db.prepare('SELECT thumbnail_key FROM items WHERE id = ?1').bind(id).first<{ thumbnail_key: string | null }>();
  await db.prepare("UPDATE items SET thumbnail_key = ?2, updated_at = datetime('now') WHERE id = ?1").bind(id, key).run();
  return prev?.thumbnail_key ?? null;
}

export async function deleteItem(db: D1Database, id: number) {
  const prev = await db.prepare('SELECT thumbnail_key FROM items WHERE id = ?1').bind(id).first<{ thumbnail_key: string | null }>();
  await db.batch([
    // 子アイテムは親なしにする（外部キーの ON DELETE SET NULL を D1 の設定に頼らない）
    db.prepare('UPDATE items SET parent_item_id = NULL WHERE parent_item_id = ?1').bind(id),
    db.prepare('DELETE FROM item_dev WHERE item_id = ?1').bind(id),
    db.prepare('DELETE FROM item_links WHERE item_id = ?1').bind(id),
    db.prepare('DELETE FROM item_services WHERE item_id = ?1').bind(id),
    db.prepare('DELETE FROM item_tags WHERE item_id = ?1').bind(id),
    db.prepare('DELETE FROM item_tasks WHERE item_id = ?1').bind(id),
    db.prepare('DELETE FROM media WHERE item_id = ?1').bind(id),
    db.prepare('DELETE FROM items WHERE id = ?1').bind(id),
  ]);
  return prev?.thumbnail_key ?? null;
}

const touch = (db: D1Database, id: number) =>
  db.prepare("UPDATE items SET updated_at = datetime('now') WHERE id = ?1").bind(id);

// ---------- カテゴリ ----------

export interface CategoryInput {
  parent_id: number | null;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
}

export async function createCategory(db: D1Database, c: CategoryInput) {
  const row = await db
    .prepare(
      `INSERT INTO categories (parent_id, slug, name, name_en, description, icon, color, sort_order)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id`,
    )
    .bind(c.parent_id, c.slug, c.name, c.name_en, c.description, c.icon, c.color, c.sort_order)
    .first<{ id: number }>();
  return row!.id;
}

export async function saveCategory(db: D1Database, id: number, c: CategoryInput) {
  await db
    .prepare(
      `UPDATE categories SET parent_id = ?2, slug = ?3, name = ?4, name_en = ?5, description = ?6, icon = ?7,
              color = ?8, sort_order = ?9, updated_at = datetime('now')
        WHERE id = ?1`,
    )
    .bind(id, c.parent_id, c.slug, c.name, c.name_en, c.description, c.icon, c.color, c.sort_order)
    .run();
}

export async function setCategoryPublic(db: D1Database, id: number, isPublic: boolean) {
  await db
    .prepare("UPDATE categories SET is_public = ?2, updated_at = datetime('now') WHERE id = ?1")
    .bind(id, isPublic ? 1 : 0)
    .run();
}

/** 中身（アイテムや子カテゴリ）があるカテゴリは消さない */
export async function deleteCategory(db: D1Database, id: number): Promise<'ok' | 'not-empty'> {
  const used = await db
    .prepare('SELECT (SELECT COUNT(*) FROM items WHERE category_id = ?1) + (SELECT COUNT(*) FROM categories WHERE parent_id = ?1) AS n')
    .bind(id)
    .first<{ n: number }>();
  if (used && used.n > 0) return 'not-empty';
  await db.prepare('DELETE FROM categories WHERE id = ?1').bind(id).run();
  return 'ok';
}

// ---------- サービス台帳 ----------

export async function listServices(db: D1Database): Promise<Service[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.dashboard_url, s.notes, COUNT(x.item_id) AS item_count
         FROM services s LEFT JOIN item_services x ON x.service_id = s.id
        GROUP BY s.id ORDER BY s.name`,
    )
    .all<Service>();
  return results;
}

export async function saveService(db: D1Database, id: number, s: { name: string; dashboard_url: string | null; notes: string | null }) {
  await db.prepare('UPDATE services SET name = ?2, dashboard_url = ?3, notes = ?4 WHERE id = ?1').bind(id, s.name, s.dashboard_url, s.notes).run();
}

export async function deleteService(db: D1Database, id: number) {
  await db.batch([
    db.prepare('DELETE FROM item_services WHERE service_id = ?1').bind(id),
    db.prepare('DELETE FROM services WHERE id = ?1').bind(id),
  ]);
}

// ---------- ホーム（ダッシュボード） ----------

export async function getDashboard(db: D1Database) {
  const [counts, recent, missing, tasks] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(is_public), 0) AS public,
              (SELECT COUNT(*) FROM v_public_items) AS visible FROM items`,
    ),
    db.prepare(`SELECT id, title, is_public, status, updated_at FROM items ORDER BY updated_at DESC LIMIT 8`),
    db.prepare(
      `SELECT id, title, is_public,
              (summary IS NULL OR summary = '') AS no_summary,
              (thumbnail_key IS NULL AND thumbnail_url IS NULL) AS no_thumbnail,
              NOT EXISTS (SELECT 1 FROM item_links l WHERE l.item_id = items.id AND l.is_public = 1) AS no_link
         FROM items
        WHERE status != 'idea'
          AND ((summary IS NULL OR summary = '') OR (thumbnail_key IS NULL AND thumbnail_url IS NULL)
               OR NOT EXISTS (SELECT 1 FROM item_links l WHERE l.item_id = items.id AND l.is_public = 1))
        ORDER BY is_public DESC, updated_at DESC LIMIT 10`,
    ),
    db.prepare(
      `SELECT t.text, i.id AS item_id, i.title FROM item_tasks t JOIN items i ON i.id = t.item_id
        WHERE t.done = 0 ORDER BY i.updated_at DESC, t.sort_order LIMIT 12`,
    ),
  ]);
  return {
    counts: counts.results[0] as { total: number; public: number; visible: number },
    recent: recent.results as { id: number; title: string; is_public: number; status: ItemStatus; updated_at: string }[],
    missing: missing.results as {
      id: number;
      title: string;
      is_public: number;
      no_summary: number;
      no_thumbnail: number;
      no_link: number;
    }[],
    tasks: tasks.results as { text: string; item_id: number; title: string }[],
  };
}

/** タイトルから URL 用 slug を作る（日本語はそのまま残し、空白を - にする） */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
