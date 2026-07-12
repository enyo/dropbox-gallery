import type { RequestHandler } from "./$types";
import { getGalleryStore } from "$lib/server/gallery/store";
import { getGalleryService } from "$lib/server/gallery/service";

export const GET: RequestHandler = async ({ params, platform }) => {
  const { lookup } = await getGalleryStore(platform).resolveByPath(params.id);
  if (lookup.status !== "ok") return new Response("Not found", { status: 404 });
  // A gallery with downloads off shows no "download all" button — but the button is
  // only the invitation, so the route has to refuse as well. Otherwise the zip stays
  // one guessed URL away, and turning downloads off would mean nothing.
  if (!lookup.downloadsEnabled) return new Response("Not found", { status: 404 });

  // Dropbox zips the folder server-side when the share link carries ?dl=1.
  const link = getGalleryService().getDownloadAllUrl(lookup.ref);
  return new Response(null, {
    status: 302,
    headers: { location: link, "cache-control": "no-store" },
  });
};
