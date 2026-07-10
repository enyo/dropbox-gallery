# Dropbox Gallery

A single-tenant web app that turns folders in one Dropbox account into shareable, image galleries with lightbox viewing. One deployment serves one Dropbox account.

## Language

**Admin**:
The single operator who creates galleries. There is exactly one (the `users` table could hold more, but the product assumes one). Signs in with the **Admin Credentials**.
_Avoid_: user (ambiguous — see **Viewer**)

**Admin Credentials**:
The username + password that protect the admin page so that only the **Admin** can mint a **Gallery Link**. Stored in the D1 `users` table as a username and a salted PBKDF2 password hash — never as plaintext, and never seen by a **Viewer**. Seeded/rotated out of band with `pnpm admin:create`; there is no public sign-up. See [ADR-0006](docs/adr/0006-admin-auth-in-d1.md).
_Avoid_: gallery password, viewer password, Admin Password (there is a username too now)

**Viewer**:
Anyone who opens a **Gallery Link**. Unauthenticated — possession of the link is the only credential.
_Avoid_: user, guest

**Gallery**:
The displayed collection of images from one **Source Folder**.

**Source Folder**:
The Dropbox folder, in the single connected account, whose images a **Gallery** displays.

**Gallery Link**:
An unguessable capability URL (`/<id>`, at the site root) that grants a **Viewer** access to exactly one **Gallery**. Possession is access — there is no viewer login or viewer password. The `<id>` is a random, opaque key into a persisted gallery record; it carries no readable data. Carries an optional expiry, set by the **Admin** at mint time (default 90 days, may be null for never), and can be **individually revoked** by the **Admin** at any time. Expiry and revocation are the containment mechanisms (both take effect once the edge cache lapses, not instantly). A gallery may also be reached through one or more **Slugs**.
_Avoid_: share link (collides with Dropbox's own "shared link" feature)

**Slug**:
An optional, human-readable name for a **Gallery Link** (`/<hash>-<slug>`, e.g. `/04213-summer-2026`), chosen by the **Admin**. The `<hash>` is a five-digit **Slug Hash** of the gallery id, prefixing the slug so it can't be reached by guessing the name alone. A convenience over the `<id>`, not a replacement: the **id always wins** when _resolving_ a URL, though once a gallery has a slug the page redirects even the id to the active slug's `/<hash>-<slug>`. A gallery can hold many slugs — setting a new one keeps the old ones alive, and the newest (**active**) slug is where the id and every stale slug redirect, so renaming a link never breaks the ones already shared. Slugs are globally unique; a slug no longer active for its gallery may be claimed by another, but an **active** slug can never be taken. See [ADR-0008](docs/adr/0008-gallery-slugs.md) and [ADR-0009](docs/adr/0009-root-urls-and-slug-hash.md).
_Avoid_: alias (unspecific), vanity URL

**Slug Hash**:
A short, deterministic five-digit decimal code derived from the gallery `<id>`, prefixing a slug in the public URL (`/<hash>-<slug>`). Deliberately weak — an obstacle to casual slug guessing and scraping, not a capability; the `<id>` remains the real secret. Reaching a slug requires its correct hash, which is a function of the unguessable id. See [ADR-0009](docs/adr/0009-root-urls-and-slug-hash.md).

## Relationships

- A **Gallery** displays the images in exactly one **Source Folder**
- A **Gallery Link** grants access to exactly one **Gallery**
- A **Gallery** has zero or more **Slugs**; the newest is its active one, and each names at most one **Gallery**
- The **Admin** mints **Gallery Links**; minting is gated by the **Admin Credentials**
- A **Viewer** needs only the **Gallery Link** — no password

## Example dialogue

> **Dev:** "When the **Admin** mints a **Gallery Link**, does the **Viewer** ever type a password?"
> **Operator:** "No. Those are the **Admin Credentials** — my username and password — which just stop anyone but me from minting links. Once a **Gallery Link** exists, whoever holds it is in."
> **Dev:** "And if I want to cut off a link I shared?"
> **Operator:** "I revoke it from the admin page — each gallery is a row in the database now. Viewers lose access once the edge cache lapses. I can still set an expiry at mint time as well."
> **Dev:** "What does the **Gallery Link** point at?"
> **Operator:** "Exactly one **Source Folder** in my Dropbox. The **Gallery** is just the images in that folder, rendered with a lightbox."

## Flagged ambiguities

- "password" in the original spec was ambiguous between an admin gate and a viewer gate — resolved: it is part of the **Admin Credentials** (admin gate only). Viewers never enter a password.
