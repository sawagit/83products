-- 83Products 初期スキーマ（D1 / wrangler d1 migrations 形式）
-- 方針: 秘密情報(APIキー/パスワード/個人情報)は保存しない。URL とサービス名だけ持つ。
-- 公開ページは v_public_* ビューだけを読む。非公開カラムは公開ビューに含めない。

-- カテゴリ（ツリー。parent_id で 2 階層まで想定）
CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  slug        TEXT NOT NULL UNIQUE,            -- URL 用 (games, apps, youtube ...)
  name        TEXT NOT NULL,                   -- 日本語表示名 (ゲーム)
  name_en     TEXT,                            -- 英語表示名 (GAMES)
  description TEXT,
  icon        TEXT,                            -- アイコン名 or 絵文字
  color       TEXT,                            -- 3D ノードの色 (#rrggbb)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_public   INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 成果物（公開してよい情報だけを持つ）
CREATE TABLE items (
  id             INTEGER PRIMARY KEY,
  category_id    INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  parent_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL, -- シリーズ/チャンネル配下など
  slug           TEXT NOT NULL UNIQUE,
  public_code    TEXT UNIQUE,                  -- 公開ID 例 83P-G01
  title          TEXT NOT NULL,
  summary        TEXT,                         -- 一覧用の 1〜2 行
  body_md        TEXT,                         -- 詳細ページ本文 (Markdown)
  thumbnail_key  TEXT,                         -- R2 のオブジェクトキー
  status         TEXT NOT NULL DEFAULT 'idea'
                 CHECK (status IN ('idea','dev','live','paused','archived')),
  released_on    TEXT,                         -- YYYY-MM-DD
  featured       INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_public      INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  published_at   TEXT,                         -- 最初に公開した日時
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_items_category ON items(category_id, sort_order);
CREATE INDEX idx_items_parent   ON items(parent_item_id);

-- 非公開専用の開発情報（1 アイテムに 1 行。公開ビューから一切参照しない）
CREATE TABLE item_dev (
  item_id      INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  repo_url     TEXT,
  preview_url  TEXT,
  prod_url     TEXT,                           -- 管理用の本番URL（公開リンクとは別）
  tech_stack   TEXT,                           -- 例: "Astro, Three.js"
  dev_notes_md TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- リンク（ストア、YouTube、X、Discord など。リンク単位で公開/非公開）
CREATE TABLE item_links (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                    -- web/store/youtube/x/discord/github/docs/other
  label      TEXT,
  url        TEXT NOT NULL,
  is_public  INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_links_item ON item_links(item_id, sort_order);

-- 画像・動画（実体は R2）
CREATE TABLE media (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  r2_key     TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('image','video')),
  alt        TEXT,
  is_public  INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 連携サービスの台帳（Cloudflare, Firebase, Steam ... 認証情報は持たない）
CREATE TABLE services (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  dashboard_url TEXT,
  notes         TEXT
);
CREATE TABLE item_services (
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  role       TEXT,                             -- 例: "ホスティング", "DB"
  console_url TEXT,                            -- そのアイテム用の管理画面URL
  PRIMARY KEY (item_id, service_id)
);

-- タグ
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

-- 非公開 ToDo（公開前チェックリストなど）
CREATE TABLE item_tasks (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ===== 公開用ビュー（公開ページはこれだけを SELECT する） =====
-- アイテムは「自分が公開」かつ「カテゴリ(と親カテゴリ)が公開」のときだけ出る
CREATE VIEW v_public_categories AS
SELECT c.id, c.parent_id, c.slug, c.name, c.name_en, c.description, c.icon, c.color, c.sort_order
FROM categories c
LEFT JOIN categories p ON p.id = c.parent_id
WHERE c.is_public = 1 AND (c.parent_id IS NULL OR p.is_public = 1);

CREATE VIEW v_public_items AS
SELECT i.id, i.category_id, i.parent_item_id, i.slug, i.public_code, i.title, i.summary, i.body_md,
       i.thumbnail_key, i.status,
       CASE i.status WHEN 'live' THEN 'live' WHEN 'archived' THEN 'archive' ELSE 'wip' END AS public_status,
       i.released_on, i.featured, i.sort_order, i.published_at,
       (SELECT l.url FROM item_links l WHERE l.item_id = i.id AND l.is_public = 1
        ORDER BY l.sort_order, l.id LIMIT 1) AS primary_url
FROM items i
JOIN v_public_categories c ON c.id = i.category_id
WHERE i.is_public = 1;

CREATE VIEW v_public_links AS
SELECT l.id, l.item_id, l.kind, l.label, l.url, l.sort_order
FROM item_links l JOIN v_public_items i ON i.id = l.item_id
WHERE l.is_public = 1;

CREATE VIEW v_public_media AS
SELECT m.id, m.item_id, m.r2_key, m.kind, m.alt, m.sort_order
FROM media m JOIN v_public_items i ON i.id = m.item_id
WHERE m.is_public = 1;

CREATE VIEW v_public_item_tags AS
SELECT it.item_id, t.name
FROM item_tags it JOIN tags t ON t.id = it.tag_id
JOIN v_public_items i ON i.id = it.item_id;

-- ===== 初期カテゴリ =====
INSERT INTO categories (slug, name, name_en, color, sort_order, is_public) VALUES
  ('games',   'ゲーム',   'Games',   '#ff7a59', 1, 1),
  ('apps',    'アプリ',   'Apps',    '#5b6cff', 2, 1),
  ('youtube', 'YouTube', 'YouTube', '#f6c453', 3, 1),
  ('x',       'X',       'X',       '#37d2b0', 4, 1),
  ('discord', 'Discord', 'Discord', '#9b7bff', 5, 1);
