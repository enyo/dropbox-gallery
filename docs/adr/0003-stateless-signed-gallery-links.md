# Stateless signed Gallery Links, no database

Galleries are not persisted. A Gallery Link is a self-contained HMAC-signed token (`/g/<token>`) whose payload encodes the Source Folder reference (account path + shared link URL), an optional title, and an optional expiry. Rendering a gallery means verifying the signature and listing the folder live from Dropbox. NeonDB was considered and deliberately not adopted.

## Considered options

- **Stateless tokens (chosen)** — zero infrastructure, fits Vercel serverless, matches the "ideally no DB" goal.
- **NeonDB gallery records** — would add per-link revocation, a "my galleries" dashboard, and view analytics.

## Consequences

- **No per-link revocation.** Individual links cannot be killed; the only containment is the per-link expiry (default 90 days) or rotating the global `GALLERY_SIGNING_SECRET` (which invalidates _all_ links).
- **No admin listing of minted galleries** and no view analytics.
- The token payload is signed but not encrypted — anyone can base64-decode it to see a Dropbox folder path, which is harmless without the account's API credentials.
- Reintroducing Neon later is the trigger if revocation, a gallery list, or analytics become required; the storage abstraction keeps Dropbox access independent of this choice. See [0002](0002-storage-provider-abstraction.md).
