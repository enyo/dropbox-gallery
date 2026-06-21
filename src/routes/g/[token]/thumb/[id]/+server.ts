import type { RequestHandler } from './$types';
import { GALLERY_SIGNING_SECRET } from '$app/env/private';
import { decodeGalleryToken } from '$lib/server/gallery/token';
import { getGalleryService } from '$lib/server/gallery/service';
import { ImageNotFoundError } from '$lib/server/gallery/types';
import { DropboxApiError } from '$lib/server/storage/dropbox';

export const GET: RequestHandler = async ({ params, url }) => {
	const decoded = decodeGalleryToken(params.token, GALLERY_SIGNING_SECRET);
	if (decoded.status !== 'ok') return new Response('Not found', { status: 404 });

	const size = url.searchParams.get('size') === 'full' ? 'full' : 'grid';

	try {
		const thumb = await getGalleryService().getThumbnail(decoded.ref, params.id, size);
		return new Response(thumb.body as BodyInit, {
			headers: {
				'content-type': thumb.contentType,
				'cache-control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (e) {
		if (e instanceof ImageNotFoundError || (e instanceof DropboxApiError && e.isNotFound)) {
			return new Response('Not found', { status: 404 });
		}
		throw e;
	}
};
