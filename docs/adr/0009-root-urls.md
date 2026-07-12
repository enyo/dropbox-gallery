# Gallery URLs at the site root (amends 0008)

Galleries now live at the site **root** rather than under `/g/`. A Gallery Link is `/<id>`,
and a slugged gallery is reached at `/<slug>` (e.g. `/summer-2026`). This amends the URL
scheme of [0008](0008-gallery-slugs.md); the slug data model, claim rules, and "id always
wins" resolution precedence are unchanged.

## Why move to the root

`/g/` was an arbitrary namespace with no meaning to a Viewer. Serving galleries straight from
the root gives the shortest, cleanest link, which is the whole point of a slug like
`summer-2026`. Nothing else the app owns needs the root: `/` redirects away to the
photographer's site, `/admin` and its sub-tree are static-prefixed routes that beat the
dynamic `/<id>` match, and everything under a gallery (`/<id>/thumb`, `/original`, `/download`,
`/track`) is more specific than `/<id>` itself. The only cost is that any unmatched top-level
path now resolves as a gallery id (a 404), which is fine.

## Resolution

`GET /<segment>` resolves `<segment>` as a raw id first (the id always wins), and only then as
a slug, looked up in `gallery_slugs`. Every `/<id>/*` sub-route resolves the same way, so
assets and the engagement beacon keep working whichever URL the Viewer arrived on, still keyed
to the canonical gallery id.

A slug is therefore **guessable**: anyone trying likely names can find a gallery that has one.
That is accepted. A slug is a short public name, not a capability — the `/<id>` link is what
carries the access guarantee, and it never stops working, so anyone wanting that guarantee
shares the id and gives the gallery no slug. Expiry and revocation still apply to every URL a
gallery answers on.

## Canonical URL

A gallery still settles on one URL ([0008](0008-gallery-slugs.md)): `galleryPath(id, activeSlug)`
returns `/<slug>` when it has an active slug, otherwise `/<id>`. The page `load` redirects
(307) the id and any stale slug to it. `galleryPath` is the single builder of the public URL
shape, shared by that redirect and every admin-facing link.

## Consequences

- **Breaking for existing `/g/…` links.** Old `/g/<id>` and `/g/<slug>` links now 404; there is
  no compatibility redirect. Acceptable because slugs and links are freshly introduced and not
  yet widely shared.
- **No schema change.** `gallery_slugs` is unchanged.
- The `/admin` session check in `hooks.server.ts` now matches `/admin` exactly (and `/admin/`
  sub-paths) rather than any path starting with `admin`, so a gallery id beginning with those
  letters can't be mistaken for an admin route.
