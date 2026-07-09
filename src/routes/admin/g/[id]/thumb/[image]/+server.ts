import type { RequestHandler } from './$types';
import { getGalleryStore } from '$lib/server/gallery/store';
import { getGalleryService } from '$lib/server/gallery/service';
import { ImageNotFoundError } from '$lib/server/gallery/types';
import { DropboxApiError } from '$lib/server/storage/dropbox';

/**
 * Admin-facing thumbnails. The viewer thumb route (`/g/<id>/thumb/...`) only
 * serves live galleries, so the admin needs its own endpoint to preview photos
 * of expired or revoked galleries. Gated on the admin session; the response is
 * marked `private` to keep these out of any shared/edge cache.
 */
export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.isAdmin) return new Response('Not found', { status: 404 });

	const record = await getGalleryStore(platform).get(params.id);
	if (!record) return new Response('Not found', { status: 404 });

	try {
		const thumb = await getGalleryService().getThumbnail(
			{ id: record.folderId, shareUrl: record.shareUrl, title: record.title },
			params.image,
			'grid'
		);
		return new Response(thumb.body as BodyInit, {
			headers: {
				'content-type': thumb.contentType,
				// URL is version-busted (?v=), so the browser may reuse it indefinitely.
				'cache-control': 'private, max-age=31536000, immutable'
			}
		});
	} catch (e) {
		if (e instanceof ImageNotFoundError || (e instanceof DropboxApiError && e.isNotFound)) {
			return new Response('Not found', { status: 404 });
		}
		throw e;
	}
};
