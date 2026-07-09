import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getGalleryStore } from '$lib/server/gallery/store';
import { getGalleryService } from '$lib/server/gallery/service';
import type { GalleryRecord } from '$lib/server/gallery/store';
import { getEventStore } from '$lib/server/gallery/events';
import { DropboxApiError } from '$lib/server/storage/dropbox';

type GalleryStatus = 'live' | 'expired' | 'revoked';

function statusOf(g: Pick<GalleryRecord, 'expiresAt' | 'revokedAt'>): GalleryStatus {
	if (g.revokedAt !== null) return 'revoked';
	if (g.expiresAt !== null && Date.now() > g.expiresAt) return 'expired';
	return 'live';
}

export const load: PageServerLoad = async ({ params, locals, platform, url }) => {
	if (!locals.isAdmin) throw redirect(303, '/admin');

	const record = await getGalleryStore(platform).get(params.id);
	if (!record) throw error(404, 'This gallery does not exist.');

	// Load the photos so we can list them with thumbnails. The gallery's admin
	// controls must still work even if the source folder has gone away, so a
	// failure here degrades to an empty list rather than erroring the page.
	let photos: { id: string; name: string; version: string; width?: number; height?: number }[] = [];
	let photosError = false;
	try {
		const gallery = await getGalleryService().loadGallery({
			id: record.folderId,
			shareUrl: record.shareUrl,
			title: record.title
		});
		photos = gallery.images;
	} catch (e) {
		if (!(e instanceof DropboxApiError && e.isNotFound)) {
			console.error('Failed to load gallery photos for admin', e);
		}
		photosError = true;
	}

	// Viewer engagement (opens, downloads). Keyed by filename, so it dangles for
	// photos since renamed or deleted; the page cross-references the live listing.
	const activity = await getEventStore(platform).summarize(record.id);

	return {
		username: locals.username ?? null,
		gallery: {
			id: record.id,
			title: record.title,
			url: `${url.origin}/g/${record.id}`,
			createdAt: record.createdAt,
			expiresAt: record.expiresAt,
			revokedAt: record.revokedAt,
			status: statusOf(record)
		},
		photos,
		photosError,
		activity
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals, platform }) => {
		if (!locals.isAdmin) return fail(401, { error: 'Not authenticated.' });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const never = data.get('never') != null;
		const date = String(data.get('expires') ?? '').trim();

		if (!title) return fail(400, { error: 'Title cannot be empty.' });

		let expiresAt: number | null;
		if (never) {
			expiresAt = null;
		} else if (!date) {
			return fail(400, { error: 'Pick an expiry date, or choose “never expires”.' });
		} else {
			// Expire at the end of the chosen day (UTC) so the link stays live through it.
			const parsed = Date.parse(`${date}T23:59:59.999Z`);
			if (Number.isNaN(parsed)) return fail(400, { error: 'That expiry date is not valid.' });
			expiresAt = parsed;
		}

		const ok = await getGalleryStore(platform).update(params.id, { title, expiresAt });
		if (!ok) return fail(404, { error: 'This gallery does not exist.' });
		// `use:enhance` invalidates and re-runs `load`, so the page reflects the change.
		return { saved: true };
	},

	delete: async ({ params, locals, platform }) => {
		if (!locals.isAdmin) return fail(401, { error: 'Not authenticated.' });
		await getGalleryStore(platform).delete(params.id);
		// The gallery id is gone for good, so its dangling counters are pure waste.
		await getEventStore(platform).deleteForGallery(params.id);
		throw redirect(303, '/admin');
	}
};
