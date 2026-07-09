import { describe, it, expect } from 'vitest';
import { summarizeRows, isGalleryEventType, type EventRow } from './events';

describe('summarizeRows', () => {
	it('sums per-image zooms and downloads and the gallery-wide download-all', () => {
		const rows: EventRow[] = [
			{ image_ref: 'a.jpg', event_type: 'zoom', count: 3 },
			{ image_ref: 'a.jpg', event_type: 'download', count: 1 },
			{ image_ref: 'b.jpg', event_type: 'zoom', count: 5 },
			{ image_ref: '', event_type: 'download_all', count: 2 }
		];
		const summary = summarizeRows(rows);
		expect(summary.downloadAll).toBe(2);
		expect(summary.totalZooms).toBe(8);
		expect(summary.totalDownloads).toBe(1);
		expect(summary.perImage).toEqual([
			{ name: 'a.jpg', zooms: 3, downloads: 1 },
			{ name: 'b.jpg', zooms: 5, downloads: 0 }
		]);
	});

	it('orders images by downloads, then zooms, then name', () => {
		const rows: EventRow[] = [
			{ image_ref: 'z.jpg', event_type: 'zoom', count: 1 },
			{ image_ref: 'a.jpg', event_type: 'zoom', count: 1 },
			{ image_ref: 'hot.jpg', event_type: 'download', count: 4 },
			{ image_ref: 'warm.jpg', event_type: 'download', count: 4 },
			{ image_ref: 'warm.jpg', event_type: 'zoom', count: 9 }
		];
		expect(summarizeRows(rows).perImage.map((s) => s.name)).toEqual([
			'warm.jpg', // 4 downloads, 9 zooms
			'hot.jpg', // 4 downloads, 0 zooms
			'a.jpg', // 0 downloads, ties on zooms -> name order
			'z.jpg'
		]);
	});

	it('ignores per-image rows with an empty ref and unknown event types', () => {
		const rows: EventRow[] = [
			{ image_ref: '', event_type: 'zoom', count: 7 }, // malformed: per-image event, no name
			{ image_ref: 'a.jpg', event_type: 'share', count: 3 } // unknown type
		];
		const summary = summarizeRows(rows);
		expect(summary.perImage).toEqual([{ name: 'a.jpg', zooms: 0, downloads: 0 }]);
		expect(summary.totalZooms).toBe(0);
	});

	it('returns an empty summary for no rows', () => {
		expect(summarizeRows([])).toEqual({
			downloadAll: 0,
			totalDownloads: 0,
			totalZooms: 0,
			perImage: []
		});
	});
});

describe('isGalleryEventType', () => {
	it('accepts the three known event types', () => {
		expect(isGalleryEventType('zoom')).toBe(true);
		expect(isGalleryEventType('download')).toBe(true);
		expect(isGalleryEventType('download_all')).toBe(true);
	});

	it('rejects anything else', () => {
		expect(isGalleryEventType('share')).toBe(false);
		expect(isGalleryEventType('')).toBe(false);
		expect(isGalleryEventType(null)).toBe(false);
		expect(isGalleryEventType(42)).toBe(false);
	});
});
