import type { Handle } from '@sveltejs/kit';
import { sessionSecret } from '$lib/server/config';
import { SESSION_COOKIE, isValidSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	// Only read the session cookie for admin routes, so /g/ pages stay cacheable.
	if (event.url.pathname.startsWith('/admin')) {
		const cookie = event.cookies.get(SESSION_COOKIE);
		event.locals.isAdmin = !!cookie && isValidSession(cookie, sessionSecret());
	} else {
		event.locals.isAdmin = false;
	}
	return resolve(event);
};
