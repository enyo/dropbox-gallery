# Dropbox Gallery

Single-tenant SvelteKit app that turns folders in one Dropbox account into clean,
shareable photo galleries with a masonry grid and lightbox. Hosted on Vercel.

See [CONTEXT.md](./CONTEXT.md) for the domain glossary and [docs/adr/](./docs/adr/)
for the key design decisions (native thumbnails, storage abstraction, stateless
links, edge caching).

## How it works

- **Admin** signs in with a password and pastes a Dropbox folder share link to mint
  a **Gallery Link** — a signed, capability URL (`/g/<token>`). No database: the
  folder reference lives inside the token.
- **Viewers** open the link and browse. Thumbnails are Dropbox's native thumbnails,
  proxied and edge-cached; originals and "download all" redirect straight to Dropbox.
- Storage is behind a `GalleryService` abstraction (no Dropbox concept), so a DB- or
  cache-backed implementation can drop in later.

## Setup

1. **Create a Dropbox app** at https://www.dropbox.com/developers/apps —
   *Scoped access*, **Full Dropbox** (not "App folder"). Under **Permissions** enable:
   `account_info.read`, `files.metadata.read`, `files.content.read`, `sharing.read`,
   `sharing.write`. Copy the **App key** and **App secret**.
2. Copy `.env.example` to `.env` and fill in `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET`,
   an `ADMIN_PASSWORD`, and random `GALLERY_SIGNING_SECRET` / `SESSION_SECRET`
   (`openssl rand -hex 32`).
3. **Capture a refresh token** (one time): `npm run auth` — open the printed URL,
   click Allow, paste the code back. It writes `DROPBOX_REFRESH_TOKEN` to `.env`.
4. Sanity-check the connection: `npm run dropbox:check`.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173  (admin at /admin)
npm run check    # type-check
npm run test     # unit tests
```

## Deploy (Vercel)

Set these environment variables in the Vercel project, then deploy:

| Variable | Notes |
| --- | --- |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` | from the Dropbox App Console |
| `DROPBOX_REFRESH_TOKEN` | from `npm run auth` |
| `ADMIN_PASSWORD` | gate for `/admin` (use a strong value) |
| `GALLERY_SIGNING_SECRET` | signs Gallery Links — rotating it invalidates all links |
| `SESSION_SECRET` | signs the admin session cookie |

`DROPBOX_ACCESS_TOKEN` is optional (a short-lived token for local testing before a
refresh token exists); leave it unset in production.
