import { signPayload, verifyPayload } from './crypto';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE = THIRTY_DAYS_MS / 1000;

/** Create a signed admin session cookie value with a 30-day expiry. */
export function createSessionValue(secret: string, now = Date.now()): string {
	return signPayload({ exp: now + THIRTY_DAYS_MS }, secret);
}

/** Validate a session cookie value: signature intact and not expired. */
export function isValidSession(value: string, secret: string, now = Date.now()): boolean {
	const payload = verifyPayload<{ exp: number }>(value, secret);
	return !!payload && typeof payload.exp === 'number' && payload.exp > now;
}
