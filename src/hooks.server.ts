import type { Handle } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { SESSION_COOKIE, readSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	// Only read the session cookie for admin routes, so public gallery pages stay
	// cacheable. Match `/admin` and its sub-paths exactly — never a gallery id that
	// merely happens to start with "admin" now that galleries live at the root.
	const { pathname } = event.url;
	if (pathname === '/admin' || pathname.startsWith('/admin/')) {
		const cookie = event.cookies.get(SESSION_COOKIE);
		const session = cookie ? readSession(cookie, SESSION_SECRET) : null;
		event.locals.isAdmin = !!session;
		event.locals.username = session?.username;
	} else {
		event.locals.isAdmin = false;
	}
	return resolve(event);
};
