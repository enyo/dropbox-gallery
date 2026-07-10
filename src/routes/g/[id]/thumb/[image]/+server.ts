import type { RequestHandler } from './$types';
import { getGalleryStore } from '$lib/server/gallery/store';
import { getGalleryService } from '$lib/server/gallery/service';
import { ImageNotFoundError } from '$lib/server/gallery/types';
import { DropboxApiError } from '$lib/server/storage/dropbox';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	const { lookup } = await getGalleryStore(platform).resolveByPath(params.id);
	if (lookup.status !== 'ok') return new Response('Not found', { status: 404 });

	const size = url.searchParams.get('size') === 'full' ? 'full' : 'grid';

	try {
		const thumb = await getGalleryService().getThumbnail(lookup.ref, params.image, size);
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
