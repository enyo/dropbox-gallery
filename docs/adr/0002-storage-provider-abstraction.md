# Storage access goes through a provider abstraction keyed on capability, not on Dropbox

File access is behind a `StorageProvider` interface (`resolveFolder`, `listImages`, `getThumbnail`, `getOriginalLink`) so the storage backend can be swapped without touching app code. The critical shape decision: `getThumbnail` promises **"a displayable image of roughly size N"**, not "a Dropbox thumbnail URL" — the provider fulfills it however it can.

## Why this shape

We investigated Proton Drive as a future backend. It is end-to-end encrypted, so the server can never render thumbnails on demand the way Dropbox does; a Proton adapter would have to download + decrypt + resize internally. Defining the interface around the _result_ (an image of size N) rather than the _mechanism_ (a server-rendered thumbnail) means the Dropbox adapter satisfies it cheaply via `get_thumbnail_v2`, while a future adapter can satisfy the same contract with its own resize step — the cost difference stays hidden inside the adapter.

## Consequences

- The app never assumes the backend can downscale for free.
- Dropbox is currently the only adapter. Proton Drive is not realistically swappable yet (no production-ready public API), but the abstraction keeps the door open. See [0001](0001-dropbox-native-thumbnails.md).
