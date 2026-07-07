# D1-backed galleries on Cloudflare (supersedes 0003)

Galleries are now persisted as rows in a **Cloudflare D1** database instead of being
encoded into stateless signed tokens. A Gallery Link is `/g/<id>`, where `<id>` is a
random, unguessable capability id that is the primary key of a `galleries` row. The row
holds the Source Folder reference (opaque Dropbox folder id + shared-link URL), the
title, `created_at`, an optional `expires_at`, and a nullable `revoked_at`. Rendering a
gallery means looking the row up by id, checking it is neither revoked nor expired, then
listing the folder live from Dropbox exactly as before. This reverses [0003](0003-stateless-signed-gallery-links.md).

The app is also now hosted on **Cloudflare Workers** (`@sveltejs/adapter-cloudflare`)
rather than Vercel; D1 is the natural database for that platform and needs no separate
provider or connection string.

## Why the reversal

The two capabilities [0003](0003-stateless-signed-gallery-links.md) explicitly traded
away — **per-link revocation** and an **admin listing of minted galleries** — became
wanted. Persisting galleries provides both directly:

- The `id` is still an unguessable capability (128-bit random, base64url); possession is
  access, and Viewers still never log in. The security model is unchanged.
- Revocation is a single `UPDATE galleries SET revoked_at = ...`; no global secret has to
  be rotated (which previously killed _all_ links at once).
- The admin page lists galleries newest-first with their status and a revoke button.

Because the id carries no data (unlike the old signed token), it is opaque — a Viewer can
no longer base64-decode a Dropbox folder path out of the URL.

## Local development

D1 is emulated locally with zero cloud setup. `@sveltejs/adapter-cloudflare`'s
`platformProxy` runs Miniflare inside `vite dev`, populating `platform.env.DB` from
`wrangler.jsonc` and persisting to `.wrangler/state`. `wrangler d1 migrations apply
--local` writes to that same local SQLite, so `pnpm db:migrate:local` then `pnpm dev`
gives a working database without a Cloudflare account. See the README.

## Consequences

- **A database now exists.** [0004](0004-ssr-edge-caching.md) still holds — the gallery
  page is still SSR + edge-cached and cookie-free — but each cache miss now does one
  indexed D1 lookup by primary key (cheap) before the Dropbox listing.
- **Revocation is not instant.** A revoked page can still be served from the edge cache
  until its `s-maxage` (~10 min) elapses, and already-fetched thumbnails are immutably
  cached. This is inherent to the capability + edge-cache model and is an accepted bound.
- **`GALLERY_SIGNING_SECRET` is gone.** Gallery Links are no longer signed (the random id
  is the secret). `SESSION_SECRET` still signs the admin cookie.
- Schema changes go through numbered files in `migrations/`, applied locally with
  `--local` and to production with `--remote`.
