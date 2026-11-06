/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

// Env（DB, CF_ACCESS_* など）の型は `npm run cf-typegen` が wrangler.jsonc から
// worker-configuration.d.ts に生成する。バインディングを足したら再生成すること。

declare namespace App {
  interface Locals {
    adminEmail?: string;
  }
}
