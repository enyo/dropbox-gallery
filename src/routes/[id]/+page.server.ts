import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getGalleryStore, galleryPath } from "$lib/server/gallery/store";
import { getGalleryService } from "$lib/server/gallery/service";
import { getDimensionCache } from "$lib/server/gallery/dimensions";
import { DropboxApiError } from "$lib/server/storage/dropbox";

export const load: PageServerLoad = async ({ params, url, platform, setHeaders }) => {
  const store = getGalleryStore(platform);
  const { lookup, galleryId } = await store.resolveByPath(params.id);
  if (lookup.status === "expired") throw error(410, "This gallery link is no longer active.");
  if (lookup.status === "revoked") throw error(410, "This gallery link has been revoked.");
  if (lookup.status === "not-found") throw error(404, "This gallery link is not valid.");

  // Every gallery settles on one canonical URL: `/<hash>-<slug>` once it has an active
  // slug, otherwise the bare `/<id>`. Whoever arrived on the id, or on a stale slug, is
  // redirected there; only the canonical URL itself renders in place. The id still wins
  // at resolution time — it just isn't always the URL the gallery settles on.
  if (galleryId) {
    const canonical = galleryPath(galleryId, await store.activeSlug(galleryId));
    if (canonical !== `/${params.id}`) throw redirect(307, canonical);
  }

  let gallery;
  try {
    gallery = await getGalleryService().loadGallery(lookup.ref, getDimensionCache(platform));
  } catch (e) {
    if (e instanceof DropboxApiError && e.isNotFound) {
      throw error(404, "The source folder for this gallery is no longer available.");
    }
    console.error("Failed to load gallery", e);
    throw error(503, "This gallery is temporarily unavailable. Please try again shortly.");
  }

  // SSR + CDN edge cache: rebuilt at most ~10 min, not per visitor. This s-maxage
  // also bounds how quickly a revocation propagates to a cached page. See ADR-0004.
  setHeaders({ "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=86400" });

  // `origin` lets the page emit absolute og:image / og:url URLs for social share
  // cards — crawlers can't resolve relative paths.
  return {
    id: params.id,
    origin: url.origin,
    title: gallery.title,
    cover: gallery.cover,
    images: gallery.images,
  };
};
