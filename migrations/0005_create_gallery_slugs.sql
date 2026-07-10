-- Optional human-readable slugs for a gallery. A Gallery Link is still primarily
-- /g/<id> (the unguessable capability id — see ADR-0005), but a gallery may also be
-- reached at /g/<slug> where <slug> is an operator-chosen name. The id always wins:
-- resolution tries the id first, then falls back to a slug.
--
-- A gallery can accumulate MANY slugs. Setting a new slug does not remove the old one —
-- the old slug stays and keeps resolving, but the gallery redirects to its newest
-- ("active") slug so a renamed link never breaks. The active slug is simply the row for
-- that gallery with the greatest created_at (rowid breaks ties). Slugs are globally
-- unique, so a slug names at most one gallery.
--
-- A slug that is no longer any gallery's active slug may be claimed by another gallery
-- (its row is reassigned). The active slug of a gallery can never be stolen this way.
CREATE TABLE gallery_slugs (
	slug        TEXT    PRIMARY KEY,                                  -- URL slug, globally unique
	gallery_id  TEXT    NOT NULL REFERENCES galleries (id),           -- the gallery it names
	created_at  INTEGER NOT NULL                                      -- epoch ms; newest row is the active slug
);

-- Resolve a gallery's slugs (and its active/newest one) with one indexed range scan.
CREATE INDEX idx_gallery_slugs_gallery ON gallery_slugs (gallery_id, created_at DESC);
