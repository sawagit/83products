# 管理画面の使い方 PDF

`public/admin/guide.pdf` の元データです。管理画面の上部バー「使い方 PDF」から開けます（/admin 配下なので Cloudflare Access で保護）。

更新するとき: `guide.html` を直し、`node docs/admin-guide/pdf.cjs` で PDF を作り直す（Playwright と日本語フォントが必要）。スクリーンショットはローカルの `npm run dev` で撮ったサンプルデータです。
