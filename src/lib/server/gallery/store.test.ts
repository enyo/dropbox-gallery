import { describe, it, expect } from 'vitest';
import { resolveRow, newGalleryId } from './store';

const baseRow = {
	id: 'abc',
	folder_id: 'id:folder',
	share_url: 'https://www.dropbox.com/scl/fo/x?rlkey=y&dl=0',
	title: 'Festival',
	created_at: 1000,
	expires_at: null as number | null,
	revoked_at: null as number | null
};

describe('resolveRow', () => {
	it('returns the gallery ref for a live row', () => {
		const result = resolveRow(baseRow, 5000);
		expect(result).toEqual({
			status: 'ok',
			ref: { id: 'id:folder', shareUrl: baseRow.share_url, title: 'Festival' }
		});
	});

	it('treats a missing row as not-found', () => {
		expect(resolveRow(null, 5000)).toEqual({ status: 'not-found' });
	});

	it('reports revoked rows as revoked, even before expiry', () => {
		const row = { ...baseRow, revoked_at: 2000, expires_at: 9999 };
		expect(resolveRow(row, 5000)).toEqual({ status: 'revoked' });
	});

	it('reports expiry only after the expiry instant', () => {
		const row = { ...baseRow, expires_at: 5000 };
		expect(resolveRow(row, 5000).status).toBe('ok'); // not yet past
		expect(resolveRow(row, 5001).status).toBe('expired');
	});

	it('never expires a row with a null expiry', () => {
		expect(resolveRow({ ...baseRow, expires_at: null }, Number.MAX_SAFE_INTEGER).status).toBe('ok');
	});
});

describe('newGalleryId', () => {
	it('is URL-safe, 128-bit, and unique across calls', () => {
		const a = newGalleryId();
		const b = newGalleryId();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/); // base64url of 16 bytes
	});
});
