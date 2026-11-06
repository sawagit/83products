// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // 公開ページも管理ページもリクエスト時に D1 を読む（公開トグルが即時反映される）
  output: 'server',
  // wrangler.jsonc のバインディング（D1 など）は `astro dev` でもローカルで再現される
  adapter: cloudflare(),
  integrations: [react()],
});
