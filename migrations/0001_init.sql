-- 83Products 初期スキーマ
-- 公開/非公開は items.published で管理する（出し入れ）。
-- 秘密情報（APIキー・パスワード・個人情報）はどの列にも保存しない。

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,          -- 例: games, apps, youtube, x, discord
  name        TEXT NOT NULL,                 -- 表示名
  color       TEXT NOT NULL DEFAULT '#5b6cff',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL UNIQUE,
  -- 公開フィールド（公開ページが読む）
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  public_url    TEXT,                        -- ストア / 動画 / プロフィールなどの公開リンク
  thumbnail_url TEXT,
  published     INTEGER NOT NULL DEFAULT 0,  -- 0 = 非公開, 1 = 公開
  published_at  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  -- 非公開フィールド（/admin だけが読む。公開クエリは SELECT しない）
  dev_notes     TEXT NOT NULL DEFAULT '',
  repo_url      TEXT,
  preview_url   TEXT,
  services      TEXT NOT NULL DEFAULT '',    -- 連携サービス名のカンマ区切り（キーは入れない）
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_published ON items(published, category_id, sort_order);

INSERT INTO categories (slug, name, color, sort_order) VALUES
  ('games',   'Games',   '#ff7a59', 1),
  ('apps',    'Apps',    '#5b6cff', 2),
  ('youtube', 'YouTube', '#f6c453', 3),
  ('x',       'X',       '#37d2b0', 4),
  ('discord', 'Discord', '#9b7bff', 5);
