import type { RequestHandler } from "./$types";
import { getGalleryStore } from "$lib/server/gallery/store";
import { getGalleryService } from "$lib/server/gallery/service";
import { thumbErrorResponse } from "$lib/server/thumb-response";

/**
 * Admin-facing thumbnails. The viewer thumb route (`/<id>/thumb/...`) only
 * serves live galleries, so the admin needs its own endpoint to preview photos
 * of expired or revoked galleries. Gated on the admin session; the response is
 * marked `private` to keep these out of any shared/edge cache.
 */
export const GET: RequestHandler = async ({ params, locals, platform }) => {
  if (!locals.isAdmin) return new Response("Not found", { status: 404 });

  const record = await getGalleryStore(platform).get(params.id);
  if (!record) return new Response("Not found", { status: 404 });

  try {
    const thumb = await getGalleryService().getThumbnail(
      // Cover fields are irrelevant here: getThumbnail keys off the raw listing.
      {
        id: record.folderId,
        shareUrl: record.shareUrl,
        title: record.title,
        coverImage: null,
        coverExcluded: false,
      },
      params.image,
      "grid",
    );
    return new Response(thumb.body as BodyInit, {
      headers: {
        "content-type": thumb.contentType,
        // URL is version-busted (?v=), so the browser may reuse it indefinitely.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    const failure = thumbErrorResponse(e);
    if (failure) return failure;
    throw e;
  }
};
