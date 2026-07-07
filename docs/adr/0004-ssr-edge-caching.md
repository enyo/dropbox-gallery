# Performance comes from SSR + CDN edge caching, not a database

Performance relies on the CDN edge cache rather than on caching Dropbox file listings in a
database. This held when galleries were stateless (see [0003](0003-stateless-signed-gallery-links.md))
and still holds now that they are persisted in D1 (see [0005](0005-d1-backed-galleries.md)): the
D1 row is looked up by primary key on a cache miss, but the expensive Dropbox listing is what the
edge cache absorbs. On Cloudflare, the same `Cache-Control` headers drive the CDN edge cache:

- **`/g/<token>` (gallery page):** rendered SSR with no cookie/session access (which keeps it cacheable), served with `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. Dropbox `list_folder` runs only on a cache miss / revalidation — not per visitor.
- **`/g/<token>/thumb/<id>?rev=<rev>` (thumbnail proxy):** `Cache-Control: public, max-age=31536000, immutable`, keyed by the file `rev`/`content_hash`. Each thumbnail is fetched from Dropbox once, then served from the edge forever; a replaced file changes its `rev` and auto-busts.
- **Originals / download-all:** not cached — 302 redirects to short-lived Dropbox links, minted per click (rare).

## Consequences

- Under steady traffic the app makes near-zero Dropbox calls, sidestepping rate limits.
- Freshness is bounded by `s-maxage`: a newly added photo appears after the gallery page revalidates, not instantly. The same bound applies to **revocation** ([0005](0005-d1-backed-galleries.md)) — a revoked gallery can still be served from the edge until its `s-maxage` elapses, and already-cached thumbnails remain reachable (they are `immutable`). Containment is eventual, not immediate.
- Galleries are built from `list_folder` plus a per-image `get_metadata` call (concurrency-limited) to obtain original dimensions, so the masonry grid can reserve space and avoid layout shift. `list_folder` does not return dimensions even by path, so the per-file calls are required. The edge cache absorbs their cost — they run only on a cache miss / revalidation, not per visitor. Membership checks for the thumbnail/original endpoints use the cheaper listing only, so they never trigger the metadata fan-out.
- Sort is still by filename. Capture-time sort and GPS/map remain future enhancements built on the same `get_metadata` response.
