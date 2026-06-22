import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { GALLERY_SIGNING_SECRET } from '$app/env/private';
import { decodeGalleryToken } from '$lib/server/gallery/token';
import { getGalleryService } from '$lib/server/gallery/service';
import { DropboxApiError } from '$lib/server/storage/dropbox';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const decoded = decodeGalleryToken(params.token, GALLERY_SIGNING_SECRET);
	if (decoded.status === 'expired') throw error(410, 'This gallery link is no longer active.');
	if (decoded.status === 'invalid') throw error(404, 'This gallery link is not valid.');

	let gallery;
	try {
		gallery = await getGalleryService().loadGallery(decoded.ref);
	} catch (e) {
		if (e instanceof DropboxApiError && e.isNotFound) {
			throw error(404, 'The source folder for this gallery is no longer available.');
		}
		console.error('Failed to load gallery', e);
		throw error(503, 'This gallery is temporarily unavailable. Please try again shortly.');
	}

	// SSR + CDN edge cache: rebuilt at most ~hourly, not per visitor. See ADR 0004.
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400' });

	return { token: params.token, title: gallery.title, images: gallery.images };
};
