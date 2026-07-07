-- Persisted galleries. The primary key `id` IS the Gallery Link capability:
-- it is a random, unguessable token that appears in the URL as /g/<id>.
-- Possession of the id grants access; there is no viewer login. Unlike the
-- earlier stateless signed tokens, a row can be revoked (revoked_at) or expire
-- (expires_at) without rotating any global secret. See ADR-0003.
CREATE TABLE galleries (
	id           TEXT    PRIMARY KEY,          -- random capability id, base64url(16 bytes)
	folder_id    TEXT    NOT NULL,             -- opaque Dropbox folder id
	share_url    TEXT    NOT NULL,             -- Dropbox shared-link URL (for "download all")
	title        TEXT    NOT NULL,             -- display title
	created_at   INTEGER NOT NULL,             -- epoch ms
	expires_at   INTEGER,                      -- epoch ms, or NULL for never
	revoked_at   INTEGER                       -- epoch ms when revoked, or NULL if live
);

-- The admin listing is ordered newest-first.
CREATE INDEX idx_galleries_created_at ON galleries (created_at DESC);
