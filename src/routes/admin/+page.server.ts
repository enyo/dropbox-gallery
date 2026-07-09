import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_SECRET } from '$app/env/private';
import { createSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from '$lib/server/session';
import { getGalleryService } from '$lib/server/gallery/service';
import { getGalleryStore } from '$lib/server/gallery/store';
import { getUserStore } from '$lib/server/auth/users';
import { verifyPassword } from '$lib/server/password';

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	if (!locals.isAdmin) return { isAdmin: false, username: null, galleries: [] };
	const galleries = (await getGalleryStore(platform).list()).map((g) => ({
		id: g.id,
		title: g.title,
		url: `${url.origin}/g/${g.id}`,
		createdAt: g.createdAt,
		expiresAt: g.expiresAt,
		revokedAt: g.revokedAt
	}));
	return { isAdmin: true, username: locals.username ?? null, galleries };
};

const EXPIRY_DAYS: Record<string, number | null> = { '30': 30, '90': 90, '365': 365, never: null };

// A valid-shaped hash to verify against when the username is unknown, so login
// timing does not reveal whether an account exists. It matches no real password.
const DUMMY_HASH =
	'pbkdf2$sha256$210000$NK0oYfeA8fUZQzjxmjDcsg$0c5ukxHnZNFc3TnN_ppj7JTQ43nvzxkVcfGeQS1H-8w';

export const actions: Actions = {
	login: async ({ request, cookies, platform }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const password = String(data.get('password') ?? '');

		const user = username ? await getUserStore(platform).findByUsername(username) : null;
		// Always run a verify (against a dummy hash when the user is missing) so a
		// wrong username and a wrong password take the same amount of time.
		const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
		if (!user || !ok) {
			return fail(401, { error: 'Wrong username or password.', values: { username } });
		}

		cookies.set(SESSION_COOKIE, createSessionValue(user.username, SESSION_SECRET), {
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

	mint: async ({ request, locals, url, platform }) => {
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
		const galleryTitle = title || folder.name;
		const id = await getGalleryStore(platform).create({
			folderId: folder.id,
			shareUrl: folder.shareUrl,
			title: galleryTitle,
			expiresAt
		});

		return { galleryUrl: `${url.origin}/g/${id}`, title: galleryTitle };
	},

	revoke: async ({ request, locals, platform }) => {
		if (!locals.isAdmin) return fail(401, { error: 'Not authenticated.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing gallery id.' });
		await getGalleryStore(platform).revoke(id);
		// `use:enhance` invalidates and re-runs `load`, refreshing the listing.
		return { revoked: id };
	}
};
