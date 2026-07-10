/**
 * Remote functions backing the admin gallery page. Photos (a live Dropbox listing,
 * the slow part) and engagement activity (a D1 aggregation) are fetched here rather
 * than in `load`, so the page shell renders immediately and these stream in behind
 * skeleton loaders. See the `{#await}` blocks in `+page.svelte`.
 *
 * Remote functions are public endpoints, so each one re-checks `locals.isAdmin` —
 * the `load`'s redirect guards the page, not these. Auth still works because for a
 * remote call SvelteKit rewrites `event.url` to the invoking page's path
 * (`/admin/g/<id>`), so `hooks.server.ts` reads the admin session as usual.
 */
import { query, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { getGalleryStore } from '$lib/server/gallery/store';
import { getGalleryService } from '$lib/server/gallery/service';
import { getEventStore } from '$lib/server/gallery/events';
import type { GalleryImage } from '$lib/server/gallery/types';
import type { GallerySummary } from '$lib/server/gallery/events';
import { DropboxApiError } from '$lib/server/storage/dropbox';

/** Standard Schema accepting a non-empty gallery id (the `/<id>` capability). */
const galleryId: StandardSchemaV1<string, string> = {
	'~standard': {
		version: 1,
		vendor: 'dropbox-gallery',
		validate: (value) =>
			typeof value === 'string' && value.length > 0
				? { value }
				: { issues: [{ message: 'A gallery id is required.' }] }
	}
};

/** Require an authenticated admin, returning the request's platform bindings. */
function requireAdmin() {
	const { locals, platform } = getRequestEvent();
	if (!locals.isAdmin) error(401, 'Not authenticated.');
	return platform;
}

export interface GalleryPhotos {
	photos: GalleryImage[];
	/** True when the source folder couldn't be listed (e.g. removed from Dropbox). */
	photosError: boolean;
}

/**
 * The gallery's photos, listed live from Dropbox. A listing failure degrades to an
 * empty list with `photosError`, so the admin controls stay usable even when the
 * source folder has gone away — matching the page's prior behaviour.
 */
export const getPhotos = query(galleryId, async (id): Promise<GalleryPhotos> => {
	const platform = requireAdmin();

	const record = await getGalleryStore(platform).get(id);
	if (!record) error(404, 'This gallery does not exist.');

	try {
		// coverExcluded:false so the admin always sees the full, unfiltered list —
		// it needs every photo to pick a cover from, cover included.
		const gallery = await getGalleryService().loadGallery({
			id: record.folderId,
			shareUrl: record.shareUrl,
			title: record.title,
			coverImage: null,
			coverExcluded: false
		});
		return { photos: gallery.images, photosError: false };
	} catch (e) {
		if (!(e instanceof DropboxApiError && e.isNotFound)) {
			console.error('Failed to load gallery photos for admin', e);
		}
		return { photos: [], photosError: true };
	}
});

/** Aggregated viewer engagement (views, downloads, download-all) for the gallery. */
export const getActivity = query(galleryId, async (id): Promise<GallerySummary> => {
	const platform = requireAdmin();
	return getEventStore(platform).summarize(id);
});
