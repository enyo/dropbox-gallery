import { signPayload, verifyPayload } from './crypto';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE = THIRTY_DAYS_MS / 1000;

interface SessionPayload {
	/** The authenticated admin's username. */
	u: string;
	/** Expiry, epoch ms. */
	exp: number;
}

/** Create a signed admin session cookie value bound to `username`, with a 30-day expiry. */
export function createSessionValue(username: string, secret: string, now = Date.now()): string {
	return signPayload({ u: username, exp: now + THIRTY_DAYS_MS } satisfies SessionPayload, secret);
}

/** Read a session cookie: returns the username if the signature is intact and unexpired. */
export function readSession(
	value: string,
	secret: string,
	now = Date.now()
): { username: string } | null {
	const payload = verifyPayload<SessionPayload>(value, secret);
	if (!payload || typeof payload.u !== 'string' || typeof payload.exp !== 'number') return null;
	if (payload.exp <= now) return null;
	return { username: payload.u };
}
