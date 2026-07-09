# Viewer engagement counters in D1

Galleries now record three viewer actions — opening an image (**zoom**), downloading a
single original (**download**), and using **download all** — as counters in a new
`gallery_events` table in the existing D1 database (see [0005](0005-d1-backed-galleries.md)).
The admin gallery page aggregates them into per-gallery totals and a per-image breakdown.

## Schema: a relational counter, not a JSON blob

`gallery_events` holds one row per `(gallery_id, image_ref, event_type)` with an integer
`count`. A click is a single statement:

```sql
INSERT INTO gallery_events (gallery_id, image_ref, event_type, count, updated_at)
VALUES (?, ?, ?, 1, ?)
ON CONFLICT (gallery_id, image_ref, event_type)
DO UPDATE SET count = count + 1, updated_at = excluded.updated_at;
```

The obvious alternative — a single JSON column of counts per gallery — was rejected
because incrementing it means read-modify-write in application code, so two viewers
clicking at once can both read `n` and both write `n + 1`, losing one. The `count = count

- 1`form pushes the increment into SQLite, which serialises the statement, so concurrent
clicks are conflict-free with no application-level locking. The relational shape also makes
the admin aggregation a plain`WHERE gallery_id = ?` served by the primary-key index, and a
  per-image breakdown a trivial grouping — awkward to express over dynamic JSON keys.

## The image reference is a loose filename, not a foreign key

`image_ref` is the Dropbox **filename** captured at click time. There is deliberately no
foreign key: there are no image rows to reference (galleries are listed live from Dropbox),
and the reference is meant to be loose. A photo renamed or deleted in Dropbox leaves its
counter dangling, naming a file no longer in the folder; the admin view cross-references the
live listing and flags such rows as _removed_ rather than hiding them. Gallery-wide events
(download all) name no image and use `''`.

## Capture: one best-effort beacon

All three events flow through `POST /g/<id>/track`, which the gallery page calls with
`navigator.sendBeacon` (a `text/plain` JSON body — same-origin, so it passes SvelteKit's
CSRF origin check, and `sendBeacon` survives the navigation a download triggers). The
endpoint records only for live galleries and always replies `204`, revealing nothing and
never disturbing viewing. Capturing client-side — rather than server-side in the
`original`/`download` redirect endpoints — keeps those endpoints pure, gives every event the
filename directly (the client knows it; the redirect endpoints only carry the opaque Dropbox
id), and unifies the one event that has no server round-trip (zoom) with the two that do.

## Consequences

- Tracking is **best-effort**: a viewer with JavaScript disabled, or a dropped beacon, is
  not counted. Acceptable for an engagement signal (the gallery already requires JS for the
  lightbox); it is not billing or audit data.
- The `/g/<id>` page stays cache-friendly and cookie-free ([0004](0004-ssr-edge-caching.md));
  the beacon is a separate, uncached `no-store` POST.
- Counts are **not spoof-proof**: anyone holding the (unguessable) gallery link can post
  events. This matches the capability model — the link already grants full viewing — and the
  data is informational.
- Deleting a gallery also deletes its counters; a new migration `0003_create_gallery_events.sql`
  must be applied before the feature works.
