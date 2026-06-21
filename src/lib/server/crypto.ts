import { createHmac, timingSafeEqual } from 'node:crypto';

function hmac(data: string, secret: string): string {
	return createHmac('sha256', secret).update(data).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

/**
 * Sign an arbitrary JSON payload into a tamper-proof token: `base64url(json).hmac`.
 * The payload is readable (not encrypted), but cannot be modified without the secret.
 */
export function signPayload(payload: unknown, secret: string): string {
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `${body}.${hmac(body, secret)}`;
}

/** Verify a token produced by {@link signPayload}; returns the payload or `null` if invalid. */
export function verifyPayload<T>(token: string, secret: string): T | null {
	const dot = token.lastIndexOf('.');
	if (dot <= 0) return null;
	const body = token.slice(0, dot);
	const signature = token.slice(dot + 1);
	if (!constantTimeEqual(signature, hmac(body, secret))) return null;
	try {
		return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
	} catch {
		return null;
	}
}
