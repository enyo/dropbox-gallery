# Use Dropbox native thumbnails instead of a self-managed cache

The original plan was to downscale images ourselves and store the results in a `_cache` folder in Dropbox. We rejected that in favor of Dropbox's native `get_thumbnail_v2` / `get_thumbnail_batch` endpoints, which render and cache downscaled JPEGs server-side (grid at a small size, lightbox at the 2048×1536 max) with zero storage, no resize code, and no freshness tracking on our side.

## Consequences

- Lightbox resolution is capped at **2048px** (Dropbox's thumbnail ceiling). Accepted as sufficient for web viewing.
- Only thumbnailable formats ≤ 20 MB are supported (jpg/png/gif/webp/bmp/tiff). RAW/HEIC/oversized files get a placeholder or are skipped.
- If true full-resolution / 4K-retina viewing is ever required, that is the one scenario that would justify reintroducing a `sharp`-based resize pipeline and the `_cache` folder.
