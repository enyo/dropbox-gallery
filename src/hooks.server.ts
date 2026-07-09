import type { Handle } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { SESSION_COOKIE, readSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	// Only read the session cookie for admin routes, so /g/ pages stay cacheable.
	if (event.url.pathname.startsWith('/admin')) {
		const cookie = event.cookies.get(SESSION_COOKIE);
		const session = cookie ? readSession(cookie, SESSION_SECRET) : null;
		event.locals.isAdmin = !!session;
		event.locals.username = session?.username;
	} else {
		event.locals.isAdmin = false;
	}
	return resolve(event);
};
