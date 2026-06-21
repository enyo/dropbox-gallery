import { fail, redirect } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { adminPassword, gallerySigningSecret, sessionSecret } from '$lib/server/config';
import { createSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from '$lib/server/session';
import { getGalleryService } from '$lib/server/gallery/service';
import { encodeGalleryToken } from '$lib/server/gallery/token';

export const load: PageServerLoad = async ({ locals }) => ({ isAdmin: locals.isAdmin });

const EXPIRY_DAYS: Record<string, number | null> = { '30': 30, '90': 90, '365': 365, never: null };

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		if (!safeEqual(password, adminPassword())) return fail(401, { error: 'Wrong password.' });
		cookies.set(SESSION_COOKIE, createSessionValue(sessionSecret()), {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			maxAge: SESSION_MAX_AGE
		});
		throw redirect(303, '/admin');
	},

	logout: async ({ cookies }) => {
		cookies.delete(SESSION_COOKIE, { path: '/' });
		throw redirect(303, '/admin');
	},

	mint: async ({ request, locals, url }) => {
		if (!locals.isAdmin) return fail(401, { error: 'Not authenticated.' });
		const data = await request.formData();
		const link = String(data.get('link') ?? '').trim();
		const title = String(data.get('title') ?? '').trim();
		const expiry = String(data.get('expiry') ?? '90');
		const values = { link, title, expiry };

		if (!link) return fail(400, { error: 'Paste a Dropbox folder link.', values });

		let folder;
		try {
			folder = await getGalleryService().resolveFolder(link);
		} catch (e) {
			return fail(400, { error: (e as Error).message, values });
		}

		const days = expiry in EXPIRY_DAYS ? EXPIRY_DAYS[expiry] : 90;
		const expiresAt = days === null ? null : Date.now() + days * 24 * 60 * 60 * 1000;
		const token = encodeGalleryToken(
			{ id: folder.id, shareUrl: folder.shareUrl, title: title || folder.name },
			expiresAt,
			gallerySigningSecret()
		);

		return { galleryUrl: `${url.origin}/g/${token}`, title: title || folder.name };
	}
};
