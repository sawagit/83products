# 83Products

自分の成果物（ゲーム、アプリ、YouTube、X、Discord など）を発信・アーカイブするサイト。

- **公開ページ** `/` — 明るい宇宙に浮かぶ「成果物ツリー」（Three.js）。公開 ON のものだけが表示される。
- **非公開ページ** `/admin` — 全情報を持つ管理画面。追加・公開トグル・削除。Cloudflare Access（ワンタイム PIN）で保護。
- データは **Cloudflare D1** に 1 か所だけ。公開トグル = 出し入れ。二重管理なし。
- 維持費 0 円（Cloudflare Workers / D1 / Access の無料枠）。

## 技術

Astro 7（SSR）+ React Three Fiber + `@astrojs/cloudflare` + Cloudflare Workers + D1。

## ローカル開発

```bash
npm install
cp .dev.vars.example .dev.vars        # ローカルでは /admin を素通りさせる
npm run db:migrate:local              # ローカル D1 にスキーマを作る
npm run dev                           # http://localhost:4321
```

`/admin` でアイテムを追加し、トグルを ON にすると `/` に惑星の衛星として現れます。

## 本番デプロイ（初回のみの手順）

1. **D1 を作る**
   ```bash
   npx wrangler login
   npx wrangler d1 create products-db
   ```
   出力された `database_id` を `wrangler.jsonc` に貼る。
   ```bash
   npm run db:migrate:remote
   ```
2. **デプロイ**
   ```bash
   npm run deploy
   ```
   `https://83products.<your-subdomain>.workers.dev` で公開される。独自ドメインは Cloudflare ダッシュボードの Workers → Settings → Domains & Routes から追加。
3. **/admin を Cloudflare Access で保護**（Zero Trust ダッシュボード、無料プラン）
   1. Zero Trust → Settings → Authentication → *Login methods* に **One-time PIN** を追加。
   2. Access → Applications → *Add an application* → **Self-hosted**。
      - Application domain: サイトのドメイン、Path: `admin`
      - Policy: Allow / Include → Emails → 自分のメールアドレス
   3. 作成後、アプリ詳細の **Application Audience (AUD) Tag** をコピー。
   4. `wrangler.jsonc` の `vars` に設定して再デプロイ：
      - `CF_ACCESS_TEAM_DOMAIN`: `<team>.cloudflareaccess.com`
      - `CF_ACCESS_AUD`: コピーした AUD
   これで `/admin` を開くとメールに 6 桁の PIN が届き、入力すると入れます。Worker 側でも JWT を検証しているので、Access を迂回したアクセスは 403 になります。

## 絶対に守ること

- API キー、パスワード、個人情報は **DB にもコードにも書かない**。`services` 列はサービス名だけ。
- 本番の `ALLOW_UNAUTHENTICATED_ADMIN` は `false` のまま。

## 管理画面とデータモデル

- スキーマは `migrations/0001_init.sql`。カテゴリ（2 階層まで）→ アイテム（子アイテム可）。開発情報・サービス・ToDo は別テーブルで、常に非公開。
- 公開ページは `v_public_*` ビューだけを読む（`src/lib/db.ts` の `getPublishedTree` など）。カテゴリかアイテムが非公開なら、リンク・画像・タグもまとめて出ない。
- サムネは外部の画像 URL（`items.thumbnail_url`）で指定できる。R2 はオプションで、`wrangler.jsonc` の `r2_buckets`（バインディング `MEDIA`、バケット `products-media`）を有効にするとアップロードが使えるようになる。アップロード画像は `/media/...` から配信し、公開中アイテムの画像だけを返す。
- 管理画面から保存される文字列は `src/lib/guard.ts` でチェックし、API キー・パスワード・メールアドレス・電話番号らしきものは保存を拒否する。`npm test` でガードの単体テストが走る。
- ローカルは `npm run db:migrate:local` のあと `npm run dev`。R2 を使う場合だけ `npx wrangler r2 bucket create products-media` → `wrangler.jsonc` の `r2_buckets` のコメントを外す → `npm run cf-typegen`。
