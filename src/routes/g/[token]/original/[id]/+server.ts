import type { RequestHandler } from './$types';
import { GALLERY_SIGNING_SECRET } from '$app/env/private';
import { decodeGalleryToken } from '$lib/server/gallery/token';
import { getGalleryService } from '$lib/server/gallery/service';
import { ImageNotFoundError } from '$lib/server/gallery/types';
import { DropboxApiError } from '$lib/server/storage/dropbox';

export const GET: RequestHandler = async ({ params }) => {
	const decoded = decodeGalleryToken(params.token, GALLERY_SIGNING_SECRET);
	if (decoded.status !== 'ok') return new Response('Not found', { status: 404 });

	try {
		const link = await getGalleryService().getOriginalUrl(decoded.ref, params.id);
		// Redirect straight to Dropbox; never proxy original bytes (Vercel 4.5 MB limit).
		return new Response(null, { status: 302, headers: { location: link, 'cache-control': 'no-store' } });
	} catch (e) {
		if (e instanceof ImageNotFoundError || (e instanceof DropboxApiError && e.isNotFound)) {
			return new Response('Not found', { status: 404 });
		}
		throw e;
	}
};
