import type { D1Database } from "@cloudflare/workers-types";

/**
 * The D1 database for the current request. Cloudflare provides the binding at
 * runtime (emulated locally by the adapter's `platformProxy`), so it is only
 * reachable through `event.platform` — never as a module-level singleton.
 */
export function getDb(platform: App.Platform | undefined): D1Database {
  const db = platform?.env?.DB;
  if (!db) {
    throw new Error(
      'D1 binding "DB" is not available. Run `pnpm db:migrate:local` and start the app with `pnpm dev` (platformProxy), or configure the binding in wrangler.jsonc.',
    );
  }
  return db;
}
