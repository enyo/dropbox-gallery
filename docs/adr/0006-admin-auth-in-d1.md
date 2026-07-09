# Admin authentication via a D1 users table

Admin sign-in is a **username + password** checked against a `users` row in D1, replacing
the single `ADMIN_PASSWORD` environment variable. Passwords are stored as salted
**PBKDF2-HMAC-SHA256** hashes in a self-describing format
(`pbkdf2$sha256$<iterations>$<salt>$<hash>`); the plaintext is never stored. This builds on
the database introduced in [0005](0005-d1-backed-galleries.md).

## Why

- `ADMIN_PASSWORD` was a single shared secret with no username, rotated only by editing an
  env var and redeploying. A `users` table gives named accounts, supports more than one
  operator, and lets a password be rotated with a script and no deploy.
- Storing a salted hash (not the plaintext) means a database leak does not directly expose
  the password, and the per-user salt defeats precomputation.

## How

- **Hashing** lives in `src/lib/server/password.ts` using the Web Crypto API only, so the
  identical code runs both in the Workers runtime (login) and under Node (the
  `admin:create` script). PBKDF2 is used because it is native to `workerd` with no
  dependency; the work factor is embedded per-hash and can be raised later without a data
  migration. Verification is constant-time.
- **Users** are a `UserStore` over D1 (`src/lib/server/auth/users.ts`).
- **Login** (`/admin` `?/login` action) looks the user up, verifies the password, and — to
  keep timing uniform whether or not the account exists — always runs a verify against a
  dummy hash when the username is unknown. The error message never distinguishes a bad
  username from a bad password.
- **Sessions** are unchanged in spirit: a signed cookie (`SESSION_SECRET`) that now carries
  the username and a 30-day expiry. The signature + expiry are checked per request; the
  user row is not re-read on every request (single-operator traffic; matches the stateless
  session model). Deleting a user therefore does not kill an existing session until it
  expires — rotate `SESSION_SECRET` to force logout of everyone.
- **Provisioning** is out of band: `pnpm admin:create` (add `--remote` for production)
  prompts for a username and hidden password, hashes it, and upserts the row via wrangler.
  There is no public sign-up route.

## Consequences

- A new secret (`ADMIN_PASSWORD`) is gone from the environment; `SESSION_SECRET` remains.
- Adding migration `0002_create_users.sql` is required before first login.
- The `users` table permits multiple operators, though the product still describes a single
  **Admin** (see CONTEXT.md); nothing enforces exactly one.
- PBKDF2 is not memory-hard like scrypt/argon2. It is a deliberate trade for a
  zero-dependency, Workers-native primitive; the embedded, tunable iteration count is the
  lever if a stronger factor is wanted.
