-- Viewer engagement counters. Each viewer action on a gallery — opening an image
-- (zoom), downloading an original, or using "download all" — increments a counter.
-- Counts are aggregated into the admin gallery page.
--
-- `image_ref` is the plain Dropbox filename recorded at click time, NOT a foreign
-- key: there is intentionally no relationship to any image row (there are none —
-- galleries are listed live from Dropbox; see ADR-0005). If a photo is renamed or
-- deleted in Dropbox its counter simply dangles, naming a file no longer in the
-- folder. Gallery-wide events ("download all") name no image and use ''.
--
-- One row per (gallery, image, event type). A click is a single atomic
--   INSERT ... ON CONFLICT DO UPDATE SET count = count + 1
-- which SQLite serialises, so concurrent clicks never lose an increment (a
-- read-modify-write on a JSON blob would). The primary key doubles as the index
-- for the per-gallery aggregation `WHERE gallery_id = ?`.
CREATE TABLE gallery_events (
	gallery_id  TEXT    NOT NULL,   -- the /g/<id> capability this event belongs to
	image_ref   TEXT    NOT NULL,   -- image filename, or '' for gallery-wide events
	event_type  TEXT    NOT NULL,   -- 'zoom' | 'download' | 'download_all'
	count       INTEGER NOT NULL DEFAULT 0,
	updated_at  INTEGER NOT NULL,   -- epoch ms of the most recent occurrence
	PRIMARY KEY (gallery_id, image_ref, event_type)
);
