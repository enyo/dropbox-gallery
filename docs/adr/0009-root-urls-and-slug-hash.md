# Gallery URLs at the site root, slugs behind a hash prefix (amends 0008)

Galleries now live at the site **root** rather than under `/g/`. A Gallery Link is `/<id>`,
and a slugged gallery is reached at `/<hash>-<slug>` — a five-digit **Slug Hash** of the
gallery id, a hyphen, then the slug (e.g. `/04213-summer-2026`). This amends the URL scheme
of [0008](0008-gallery-slugs.md); the slug data model, claim rules, and "id always wins"
resolution precedence are unchanged.

## Why move to the root

`/g/` was an arbitrary namespace with no meaning to a Viewer. Serving galleries straight from
the root gives the shortest, cleanest link, which is the whole point of a slug like
`summer-2026`. Nothing else the app owns needs the root: `/` redirects away to the
photographer's site, `/admin` and its sub-tree are static-prefixed routes that beat the
dynamic `/<id>` match, and everything under a gallery (`/<id>/thumb`, `/original`, `/download`,
`/track`) is more specific than `/<id>` itself. The only cost is that any unmatched top-level
path now resolves as a gallery id (a 404), which is fine.

## Why a hash prefix on slugs

A bare slug is guessable. Under 0008, `/g/summer-2026` could be found by anyone trying likely
names — the slug was a convenience layer with **no** access cost, which quietly weakened the
capability model for any gallery that had one. Prefixing the slug with a five-digit code
derived from the (unguessable) id means a slug URL can't be constructed, or guessed, without
already holding the id — or brute-forcing a ~100,000-wide space per slug guess, which is
rate-limitable and defeats casual scraping.

This is **deliberately weak**. It is an obstacle, not a second capability: the `<id>` remains
the real secret, and a determined attacker with a known slug could grind the hash space. That
is an accepted trade for keeping the URL short and human-readable. Anyone who wants the full
capability guarantee simply shares the `/<id>` link, which never stops working.

## Resolution

`GET /<segment>` resolves `<segment>` as a raw id first (the id always wins), and only then as
a `<hash>-<slug>`: the slug is looked up, and its stored gallery's `slugHash` must equal the
prefix or the request is a 404. So a bare slug, or a slug carrying the wrong hash, does not
resolve — closing the guessing hole. Every `/<id>/*` sub-route resolves the same way, so assets
and the engagement beacon keep working whichever URL the Viewer arrived on, still keyed to the
canonical gallery id.

- The **hash is a function of the id alone**, so all of a gallery's slugs share one prefix, and
  the prefix is stable across renames.
- `slugHash` is a small FNV-1a folded into five decimal digits — **not** collision-free. A
  collision would only let one gallery's prefix also satisfy another gallery's slug URL; both
  are the operator's own galleries and slug global-uniqueness is untouched, so this is harmless.

## Canonical URL

A gallery still settles on one URL ([0008](0008-gallery-slugs.md)): `galleryPath(id, activeSlug)`
returns `/<hash>-<slug>` when it has an active slug, otherwise `/<id>`. The page `load` redirects
(307) the id and any stale slug to it. `galleryPath` is the single builder of the public URL
shape, shared by that redirect and every admin-facing link.

## Consequences

- **Breaking for existing `/g/…` links.** Old `/g/<id>` and `/g/<slug>` links now 404; there is
  no compatibility redirect. Acceptable because slugs and links are freshly introduced and not
  yet widely shared.
- **No schema change.** The hash is computed, never stored; `gallery_slugs` is unchanged.
- The `/admin` session check in `hooks.server.ts` now matches `/admin` exactly (and `/admin/`
  sub-paths) rather than any path starting with `admin`, so a gallery id beginning with those
  letters can't be mistaken for an admin route.
