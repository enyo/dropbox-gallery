import type { RequestHandler } from './$types';
import { getGalleryStore } from '$lib/server/gallery/store';
import { getEventStore, isGalleryEventType } from '$lib/server/gallery/events';

/** Cap a stored filename; Dropbox names are ≤255, this is slack against garbage. */
const MAX_NAME = 512;

/**
 * Best-effort engagement beacon. The gallery page posts here (via
 * `navigator.sendBeacon`, hence a `text/plain` JSON body) when a viewer opens an
 * image, downloads one, or uses "download all". Fire-and-forget: the response is
 * always 204 with no body, so a blocked or failed beacon never disturbs viewing,
 * and the endpoint reveals nothing about whether the gallery exists. Only live
 * galleries are recorded.
 */
export const POST: RequestHandler = async ({ params, request, platform }) => {
	const noContent = new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

	const lookup = await getGalleryStore(platform).resolve(params.id);
	if (lookup.status !== 'ok') return noContent;

	let type: unknown;
	let name: unknown;
	try {
		({ type, name } = JSON.parse(await request.text()));
	} catch {
		return noContent;
	}
	if (!isGalleryEventType(type)) return noContent;

	// download_all names no image; zoom/download need a usable filename or are dropped.
	const imageName =
		typeof name === 'string' && name.length > 0 && name.length <= MAX_NAME ? name : null;
	if (type === 'download_all' || imageName) {
		await getEventStore(platform).record(params.id, type, imageName);
	}

	return noContent;
};
