/**
 * Password hashing with PBKDF2-HMAC-SHA256 over the Web Crypto API. Uses only
 * globals (`crypto`, `TextEncoder`, `btoa`/`atob`), so the exact same code runs
 * in the Cloudflare Workers runtime and in Node (the `admin:create` script).
 *
 * The stored value is self-describing, so the iteration count can be raised
 * later without a data migration — old hashes still verify against their own
 * embedded parameters:
 *
 *   pbkdf2$sha256$<iterations>$<saltB64url>$<hashB64url>
 */

// OWASP-recommended floor for PBKDF2-HMAC-SHA256; tune upward over time.
const ITERATIONS = 100_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

function toB64url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

async function deriveKey(
	password: string,
	salt: Uint8Array<ArrayBuffer>,
	iterations: number,
	keyBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
		key,
		keyBytes * 8
	);
	return new Uint8Array(bits);
}

/** Compare two byte arrays in constant time (no early exit on mismatch). */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

/** Hash a plaintext password into a self-describing, storable string. */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await deriveKey(password, salt, ITERATIONS, KEY_BYTES);
	return `pbkdf2$sha256$${ITERATIONS}$${toB64url(salt)}$${toB64url(hash)}`;
}

/**
 * Verify a plaintext password against a stored hash. Returns false (rather than
 * throwing) on any malformed input, so callers can treat it as a plain check.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
	const iterations = Number(parts[2]);
	if (!Number.isInteger(iterations) || iterations <= 0) return false;
	let salt: Uint8Array<ArrayBuffer>;
	let expected: Uint8Array<ArrayBuffer>;
	try {
		salt = fromB64url(parts[3]);
		expected = fromB64url(parts[4]);
	} catch {
		return false;
	}
	const actual = await deriveKey(password, salt, iterations, expected.length);
	return constantTimeEqual(actual, expected);
}
