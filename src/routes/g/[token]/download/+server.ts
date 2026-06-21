import type { RequestHandler } from './$types';
import { GALLERY_SIGNING_SECRET } from '$app/env/private';
import { decodeGalleryToken } from '$lib/server/gallery/token';
import { getGalleryService } from '$lib/server/gallery/service';

export const GET: RequestHandler = async ({ params }) => {
	const decoded = decodeGalleryToken(params.token, GALLERY_SIGNING_SECRET);
	if (decoded.status !== 'ok') return new Response('Not found', { status: 404 });

	// Dropbox zips the folder server-side when the share link carries ?dl=1.
	const link = getGalleryService().getDownloadAllUrl(decoded.ref);
	return new Response(null, { status: 302, headers: { location: link, 'cache-control': 'no-store' } });
};
