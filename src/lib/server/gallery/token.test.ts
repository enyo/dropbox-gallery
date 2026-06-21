import { describe, it, expect } from 'vitest';
import { encodeGalleryToken, decodeGalleryToken } from './token';
import type { GalleryRef } from './types';

const SECRET = 'gallery-secret';
const ref: GalleryRef = { id: '/test/festival', shareUrl: 'https://db.com/scl/fo/x', title: 'Festival' };

describe('gallery token', () => {
	it('round-trips a folder reference', () => {
		const token = encodeGalleryToken(ref, null, SECRET);
		const result = decodeGalleryToken(token, SECRET);
		expect(result).toEqual({ status: 'ok', ref });
	});

	it('reports expired tokens distinctly from invalid ones', () => {
		const past = Date.now() - 1000;
		const token = encodeGalleryToken(ref, past, SECRET);
		expect(decodeGalleryToken(token, SECRET).status).toBe('expired');
	});

	it('honours a not-yet-reached expiry', () => {
		const future = Date.now() + 60_000;
		const token = encodeGalleryToken(ref, future, SECRET);
		expect(decodeGalleryToken(token, SECRET).status).toBe('ok');
	});

	it('reports invalid for a wrong secret', () => {
		const token = encodeGalleryToken(ref, null, SECRET);
		expect(decodeGalleryToken(token, 'wrong').status).toBe('invalid');
	});
});
