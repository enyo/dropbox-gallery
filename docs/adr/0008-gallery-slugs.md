# Optional human-readable slugs for gallery links

A Gallery Link is still primarily `/g/<id>`, where `<id>` is the unguessable capability id
(see [0005](0005-d1-backed-galleries.md)). A gallery may now _also_ be reached at
`/g/<slug>`, where `<slug>` is a short operator-chosen name (e.g. `summer-2026`). Slugs live
in a new `gallery_slugs` table and are managed from the admin gallery page. They are a
convenience layer over the id; the security model is unchanged.

## Resolution: the id always wins

`GET /g/<value>` resolves `<value>` as an id first and only falls back to a slug when no
gallery has that id. So an id can never be shadowed by a slug, and a slug that happens to
collide with some gallery's id is simply unreachable. A slug is globally unique, so it names
at most one gallery. Every `/g/<id>/*` sub-route (thumbnails, originals, download, the
engagement beacon) resolves id-or-slug the same way, so assets keep working whichever URL the
viewer arrived on. The beacon records under the **canonical gallery id**, so counters never
fragment across a gallery's slugs.

"The id always wins" is about _resolution precedence_, not the URL a gallery settles on:
resolving by id never gets shadowed, but once a gallery has a slug the page still redirects the
id to that slug (below).

## Many slugs per gallery, newest is active

Setting a new slug does **not** remove the old one: a gallery accumulates slugs over time. The
newest (greatest `created_at`, `rowid` breaking ties) is the **active** slug. A gallery that
has any slug is always shown under its active one: requesting it by the id, or by a _stale_
slug, serves a `307` redirect to the active slug. Only the active slug itself renders in place
(and a gallery with no slug at all renders under its id). So renaming a link never breaks the
links already shared — every earlier name, and the id, keep resolving and land the viewer on
the current URL.

## Claiming: an active slug is protected, a stale one is fair game

Setting a slug is governed by one pure rule (`decideSlugClaim`):

- Unknown slug → **insert**.
- Your gallery's own active slug → **no-op**.
- Your gallery's own stale slug → **reclaim** (re-activates it).
- Another gallery's stale slug → **reclaim** (allowed — stale slugs are up for grabs).
- Another gallery's active slug → **reject**.

So a gallery can never steal the slug another gallery is _currently_ redirecting to, but a
slug that has since been superseded may be taken over by anyone. Reclaiming deletes the old
row and re-inserts it, giving the row a fresh `created_at`/`rowid` so it is unambiguously the
new owner's active slug.

## Consequences

- **Not instant, like everything else here.** A slug change propagates only as the edge cache
  lapses ([0004](0004-ssr-edge-caching.md)); a stale slug reclaimed by another gallery can
  briefly serve the old cached page. Consistent with revocation/expiry.
- **No foreign-key enforcement.** D1/SQLite leaves `PRAGMA foreign_keys` off, so the
  `REFERENCES galleries(id)` is documentation only; deleting a gallery explicitly deletes its
  slugs (a batch alongside the row delete), mirroring how counters are cleaned up.
- Requires migration `0005_create_gallery_slugs.sql`.
