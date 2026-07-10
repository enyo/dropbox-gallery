import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getGalleryStore } from '$lib/server/gallery/store';
import { getGalleryService } from '$lib/server/gallery/service';
import { DropboxApiError } from '$lib/server/storage/dropbox';

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	const store = getGalleryStore(platform);
	const { lookup, galleryId } = await store.resolveByPath(params.id);
	if (lookup.status === 'expired') throw error(410, 'This gallery link is no longer active.');
	if (lookup.status === 'revoked') throw error(410, 'This gallery link has been revoked.');
	if (lookup.status === 'not-found') throw error(404, 'This gallery link is not valid.');

	// A gallery with a slug is always shown under its active (newest) slug: whether the
	// viewer arrived on the id or on a stale slug, redirect them to it. Only the active
	// slug itself (or a gallery with no slug at all) renders in place. The id still wins
	// at resolution time — it just isn't the URL the gallery settles on.
	if (galleryId) {
		const active = await store.activeSlug(galleryId);
		if (active && active !== params.id) throw redirect(307, `/g/${active}`);
	}

	let gallery;
	try {
		gallery = await getGalleryService().loadGallery(lookup.ref);
	} catch (e) {
		if (e instanceof DropboxApiError && e.isNotFound) {
			throw error(404, 'The source folder for this gallery is no longer available.');
		}
		console.error('Failed to load gallery', e);
		throw error(503, 'This gallery is temporarily unavailable. Please try again shortly.');
	}

	// SSR + CDN edge cache: rebuilt at most ~10 min, not per visitor. This s-maxage
	// also bounds how quickly a revocation propagates to a cached page. See ADR-0004.
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400' });

	return { id: params.id, title: gallery.title, cover: gallery.cover, images: gallery.images };
};
