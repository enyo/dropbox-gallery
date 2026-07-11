-- Measured pixel dimensions of an image, so a gallery never has to ask Dropbox twice.
--
-- Dropbox only reports dimensions one file at a time, via `files/get_metadata` with
-- `include_media_info` — the same flag on `files/list_folder` is deprecated and now
-- returns nothing, so there is no batch call to reach for. Laying out a 200-photo
-- gallery therefore cost 200 external subrequests, and a Worker invocation is allowed
-- 50 (Workers Free). Past that every fetch throws, dimensions came back null, and the
-- whole tail of the gallery was laid out at the default 3:2 — landscape boxes around
-- portrait photos, in the grid and stretched in the lightbox.
--
-- Dimensions are a pure function of the file's bytes, so a row keyed by content version
-- never goes stale: re-uploading a photo yields a new version and a new row, and the
-- old one is simply never read again.
CREATE TABLE image_dimensions (
	file_id     TEXT    NOT NULL, -- Dropbox file id ("id:...")
	version     TEXT    NOT NULL, -- content hash; the same file_id may have several over time
	width       INTEGER NOT NULL,
	height      INTEGER NOT NULL,
	measured_at INTEGER NOT NULL, -- epoch ms, for debugging and future pruning
	PRIMARY KEY (file_id, version)
);
