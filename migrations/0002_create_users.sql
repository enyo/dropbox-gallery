-- Admin users. Replaces the single `ADMIN_PASSWORD` env var with credentials
-- stored in the database: a username and a salted PBKDF2 password hash. The
-- hash is self-describing (`pbkdf2$sha256$<iterations>$<salt>$<hash>`), so the
-- work factor can be raised later without a schema change. See ADR-0006.
CREATE TABLE users (
	username      TEXT    PRIMARY KEY,
	password_hash TEXT    NOT NULL,
	created_at    INTEGER NOT NULL   -- epoch ms
);
