-- Per-gallery cover image. `cover_image` is the plain Dropbox filename (NOT a file
-- id and NOT a foreign key) of the image shown as the gallery's full-screen cover,
-- mirroring how gallery_events.image_ref records a filename. Storing the name keeps
-- the choice stable across re-listings, since Dropbox file ids can churn. NULL means
-- "no explicit cover" — the gallery falls back to its first image. A stored name that
-- no longer matches any file in the folder also falls back to the first image.
--
-- `cover_excluded`, when 1, drops the resolved cover from the grid so it appears only
-- as the hero and not again among the thumbnails below it.
ALTER TABLE galleries ADD COLUMN cover_image    TEXT;
ALTER TABLE galleries ADD COLUMN cover_excluded INTEGER NOT NULL DEFAULT 0;
