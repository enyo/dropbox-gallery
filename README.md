# Dropbox Gallery

Single-tenant SvelteKit app that turns folders in one Dropbox account into clean,
shareable photo galleries with a masonry grid and lightbox. Hosted on Cloudflare Workers,
with galleries persisted in Cloudflare D1.

See [CONTEXT.md](./CONTEXT.md) for the domain glossary and [docs/adr/](./docs/adr/)
for the key design decisions (native thumbnails, storage abstraction, D1-backed galleries,
edge caching).

## How it works

- **Admin** signs in with a username + password (stored in D1, salted-hashed) and pastes a Dropbox folder share link to mint
  a **Gallery Link** — an unguessable capability URL (`/<id>`, at the site root). The `<id>`
  is the primary key of a row in D1 that holds the folder reference, title, and expiry; the id
  itself carries no readable data. A gallery can also carry a friendly **slug**, reached at
  `/<hash>-<slug>` — a five-digit hash of the id prefixes the slug so it can't be guessed by
  name alone ([ADR-0009](docs/adr/0009-root-urls-and-slug-hash.md)).
- **Viewers** open the link and browse. Thumbnails are Dropbox's native thumbnails,
  proxied and edge-cached; originals and "download all" redirect straight to Dropbox.
- The Admin can **list and revoke** minted galleries from `/admin`. Revocation and expiry
  both take effect once the edge cache lapses (~10 min), not instantly.
- Storage is behind a `GalleryService` abstraction (no Dropbox concept), and persistence
  is behind a `GalleryStore` (D1) — either can be swapped without touching the routes.

## Setup

1. **Create a Dropbox app** at https://www.dropbox.com/developers/apps —
   _Scoped access_, **Full Dropbox** (not "App folder"). Under **Permissions** enable:
   `account_info.read`, `files.metadata.read`, `files.content.read`, `sharing.read`,
   `sharing.write`. Copy the **App key** and **App secret**.
2. Create a `.env` file and fill in `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` and a
   random `SESSION_SECRET` (`openssl rand -hex 32`). Every variable is declared and
   documented in [`src/env.ts`](./src/env.ts). (Admin credentials are _not_ env vars —
   see below.)
3. **Capture a refresh token** (one time): `pnpm auth` — open the printed URL,
   click Allow, paste the code back. It writes `DROPBOX_REFRESH_TOKEN` to `.env`.
4. Sanity-check the connection: `pnpm dropbox:check`.

## Develop

```sh
pnpm install
pnpm db:migrate:local   # create/upgrade the local D1 database (.wrangler/state)
pnpm admin:create       # create an admin user (username + password) in the local D1
pnpm dev                # http://localhost:5173  (admin at /admin)
pnpm check              # type-check
pnpm test               # unit tests
```

Admin sign-in is username + password, stored in the D1 `users` table as a salted
PBKDF2 hash (see [ADR-0006](./docs/adr/0006-admin-auth-in-d1.md)). Create or rotate a
user with `pnpm admin:create` (add `--remote` to write to production). There is no public
sign-up — credentials are only ever seeded out of band with that script.

`pnpm dev` runs the app in the Cloudflare Workers runtime via the adapter's
`platformProxy`, so the `DB` binding is a real (local) D1 database — the same SQLite that
`pnpm db:migrate:local` writes to. No Cloudflare account is needed for local development.

Inspect or seed the local DB with wrangler:

```sh
pnpm exec wrangler d1 execute dropbox-gallery --local --command "SELECT * FROM galleries"
```

### Database migrations

Schema lives in [`migrations/`](./migrations) as numbered `.sql` files. After adding one:

```sh
pnpm db:migrate:local   # apply to the local D1 (dev)
pnpm db:migrate         # apply to the remote D1 (production; needs `wrangler login`)
```

## Deploy (Cloudflare)

1. `pnpm exec wrangler login` (one time).
2. **Create the production D1 database** and paste its id into [`wrangler.jsonc`](./wrangler.jsonc)
   (replacing the placeholder `database_id`):
   ```sh
   pnpm db:create        # wrangler d1 create dropbox-gallery
   ```
3. **Apply migrations** to the remote database: `pnpm db:migrate`.
4. **Create the admin user** in production: `pnpm admin:create --remote`.
5. **Set secrets** (they are read at runtime from the Worker's environment, not baked in):
   ```sh
   pnpm exec wrangler secret put DROPBOX_APP_KEY
   pnpm exec wrangler secret put DROPBOX_APP_SECRET
   pnpm exec wrangler secret put DROPBOX_REFRESH_TOKEN
   pnpm exec wrangler secret put SESSION_SECRET
   ```
6. **Deploy:** `pnpm deploy` (builds with `@sveltejs/adapter-cloudflare`, then `wrangler deploy`).

| Variable                                 | Notes                                                  |
| ---------------------------------------- | ------------------------------------------------------ |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` | from the Dropbox App Console                           |
| `DROPBOX_REFRESH_TOKEN`                  | from `pnpm auth`                                       |
| `SESSION_SECRET`                         | signs the admin session cookie                         |
| `DB` (binding)                           | Cloudflare D1 database, configured in `wrangler.jsonc` |

Admin credentials are not env vars — they live in the D1 `users` table; seed them with
`pnpm admin:create --remote`.
