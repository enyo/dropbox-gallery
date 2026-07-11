import type { RequestHandler } from "./$types";
import { getGalleryStore } from "$lib/server/gallery/store";
import { getGalleryService } from "$lib/server/gallery/service";
import { thumbErrorResponse } from "$lib/server/thumb-response";

export const GET: RequestHandler = async ({ params, url, platform }) => {
  const { lookup } = await getGalleryStore(platform).resolveByPath(params.id);
  if (lookup.status !== "ok") return new Response("Not found", { status: 404 });

  const size = url.searchParams.get("size") === "full" ? "full" : "grid";

  try {
    const thumb = await getGalleryService().getThumbnail(lookup.ref, params.image, size);
    return new Response(thumb.body as BodyInit, {
      headers: {
        "content-type": thumb.contentType,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    const failure = thumbErrorResponse(e);
    if (failure) return failure;
    throw e;
  }
};
