// D1 アクセス層。
// 公開用クエリは公開フィールドしか SELECT しないことで、非公開情報の漏れを構造的に防ぐ。

export interface Category {
  id: number;
  slug: string;
  name: string;
  color: string;
  sort_order: number;
}

/** 公開ページに出してよいフィールドだけ */
export interface PublicItem {
  id: number;
  category_id: number;
  slug: string;
  title: string;
  summary: string;
  public_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
}

/** 管理ページ用：すべてのフィールド */
export interface AdminItem extends PublicItem {
  published: number;
  sort_order: number;
  dev_notes: string;
  repo_url: string | null;
  preview_url: string | null;
  services: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryWithItems<T> extends Category {
  items: T[];
}

const PUBLIC_COLUMNS =
  'id, category_id, slug, title, summary, public_url, thumbnail_url, published_at';

export async function getCategories(db: D1Database): Promise<Category[]> {
  const { results } = await db
    .prepare('SELECT id, slug, name, color, sort_order FROM categories ORDER BY sort_order, id')
    .all<Category>();
  return results;
}

/** 公開ページ：published = 1 のものだけ、公開フィールドだけ */
export async function getPublishedTree(db: D1Database): Promise<CategoryWithItems<PublicItem>[]> {
  const [categories, items] = await Promise.all([
    getCategories(db),
    db
      .prepare(
        `SELECT ${PUBLIC_COLUMNS} FROM items WHERE published = 1 ORDER BY category_id, sort_order, id`,
      )
      .all<PublicItem>()
      .then((r) => r.results),
  ]);
  return groupByCategory(categories, items);
}

/** 管理ページ：全件・全フィールド */
export async function getAdminTree(db: D1Database): Promise<CategoryWithItems<AdminItem>[]> {
  const [categories, items] = await Promise.all([
    getCategories(db),
    db
      .prepare('SELECT * FROM items ORDER BY category_id, sort_order, id')
      .all<AdminItem>()
      .then((r) => r.results),
  ]);
  return groupByCategory(categories, items);
}

export async function setPublished(db: D1Database, id: number, published: boolean) {
  await db
    .prepare(
      `UPDATE items
         SET published = ?1,
             published_at = CASE WHEN ?1 = 1 AND published_at IS NULL THEN datetime('now') ELSE published_at END,
             updated_at = datetime('now')
       WHERE id = ?2`,
    )
    .bind(published ? 1 : 0, id)
    .run();
}

export interface NewItem {
  category_id: number;
  slug: string;
  title: string;
  summary: string;
  public_url: string | null;
  dev_notes: string;
  repo_url: string | null;
  preview_url: string | null;
  services: string;
}

export async function createItem(db: D1Database, item: NewItem) {
  await db
    .prepare(
      `INSERT INTO items (category_id, slug, title, summary, public_url, dev_notes, repo_url, preview_url, services)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(
      item.category_id,
      item.slug,
      item.title,
      item.summary,
      item.public_url,
      item.dev_notes,
      item.repo_url,
      item.preview_url,
      item.services,
    )
    .run();
}

export async function deleteItem(db: D1Database, id: number) {
  await db.prepare('DELETE FROM items WHERE id = ?1').bind(id).run();
}

function groupByCategory<T extends { category_id: number }>(
  categories: Category[],
  items: T[],
): CategoryWithItems<T>[] {
  return categories.map((c) => ({
    ...c,
    items: items.filter((i) => i.category_id === c.id),
  }));
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
