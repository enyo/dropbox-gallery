import type { RequestHandler } from './$types';
import { getGalleryStore } from '$lib/server/gallery/store';
import { getGalleryService } from '$lib/server/gallery/service';
import { ImageNotFoundError } from '$lib/server/gallery/types';
import { DropboxApiError } from '$lib/server/storage/dropbox';

export const GET: RequestHandler = async ({ params, platform }) => {
	const { lookup } = await getGalleryStore(platform).resolveByPath(params.id);
	if (lookup.status !== 'ok') return new Response('Not found', { status: 404 });

	try {
		const link = await getGalleryService().getOriginalUrl(lookup.ref, params.image);
		// Redirect straight to Dropbox; never proxy original bytes through the Worker.
		return new Response(null, {
			status: 302,
			headers: { location: link, 'cache-control': 'no-store' }
		});
	} catch (e) {
		if (e instanceof ImageNotFoundError || (e instanceof DropboxApiError && e.isNotFound)) {
			return new Response('Not found', { status: 404 });
		}
		throw e;
	}
};
