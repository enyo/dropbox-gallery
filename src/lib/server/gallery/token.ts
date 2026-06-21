import { signPayload, verifyPayload } from '../crypto';
import type { GalleryRef } from './types';

interface TokenPayload {
	/** Opaque folder id (the storage backend decides what this means). */
	i: string;
	/** Share URL, used only for the "download all" shortcut. */
	s: string;
	/** Display title. */
	t: string;
	/** Expiry as epoch ms, or null for never. */
	e: number | null;
}

export type DecodeResult =
	| { status: 'ok'; ref: GalleryRef }
	| { status: 'expired' }
	| { status: 'invalid' };

/** Encode a signed Gallery Link token. `expiresAt` is epoch ms, or null for never. */
export function encodeGalleryToken(
	ref: GalleryRef,
	expiresAt: number | null,
	secret: string
): string {
	const payload: TokenPayload = { i: ref.id, s: ref.shareUrl, t: ref.title, e: expiresAt };
	return signPayload(payload, secret);
}

/** Decode and validate a Gallery Link token, distinguishing expired from invalid. */
export function decodeGalleryToken(token: string, secret: string, now = Date.now()): DecodeResult {
	const payload = verifyPayload<TokenPayload>(token, secret);
	if (!payload || typeof payload.i !== 'string') return { status: 'invalid' };
	if (payload.e !== null && now > payload.e) return { status: 'expired' };
	return { status: 'ok', ref: { id: payload.i, shareUrl: payload.s, title: payload.t } };
}
