import { describe, it, expect } from 'vitest';
import { isThumbnailableImage, byNaturalName } from './images';

describe('isThumbnailableImage', () => {
	it('accepts supported image extensions (case-insensitive)', () => {
		for (const name of ['a.jpg', 'b.JPEG', 'c.png', 'd.gif', 'e.webp', 'f.bmp', 'g.tiff', 'h.tif']) {
			expect(isThumbnailableImage(name)).toBe(true);
		}
	});

	it('rejects non-thumbnailable files (incl. HEIC, video, docs)', () => {
		for (const name of ['photo.heic', 'clip.mp4', 'doc.pdf', 'raw.cr2', 'noext']) {
			expect(isThumbnailableImage(name)).toBe(false);
		}
	});
});

describe('byNaturalName', () => {
	it('orders numerically, not lexicographically', () => {
		const sorted = [{ name: 'IMG_10.jpg' }, { name: 'IMG_2.jpg' }, { name: 'IMG_1.jpg' }].sort(byNaturalName);
		expect(sorted.map((f) => f.name)).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
	});
});
