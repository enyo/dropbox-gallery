import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getGalleryStore } from '$lib/server/gallery/store';
import type { GalleryRecord } from '$lib/server/gallery/store';
import { getEventStore } from '$lib/server/gallery/events';

type GalleryStatus = 'live' | 'expired' | 'revoked';

function statusOf(g: Pick<GalleryRecord, 'expiresAt' | 'revokedAt'>): GalleryStatus {
	if (g.revokedAt !== null) return 'revoked';
	if (g.expiresAt !== null && Date.now() > g.expiresAt) return 'expired';
	return 'live';
}

// `load` returns only the gallery metadata — a single indexed D1 lookup — so the page
// shell paints immediately. The photos (a live Dropbox listing) and the engagement
// activity stream in via the `./data.remote` queries behind skeleton loaders.
export const load: PageServerLoad = async ({ params, locals, platform, url }) => {
	if (!locals.isAdmin) throw redirect(303, '/admin');

	const record = await getGalleryStore(platform).get(params.id);
	if (!record) throw error(404, 'This gallery does not exist.');

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
		}
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
