import { describe, it, expect, vi } from 'vitest';
import { StorageBackedGalleryService } from './service';
import { ImageNotFoundError } from './types';
import type { GalleryRef } from './types';
import type { StorageProvider, StoredFile } from '../storage/types';

const ref: GalleryRef = {
	id: '/test/festival',
	shareUrl: 'https://www.dropbox.com/scl/fo/x?rlkey=y&dl=0',
	title: 'Festival'
};

function fakeStorage(
	files: StoredFile[],
	dims: Record<string, { width: number; height: number }> = {}
): StorageProvider {
	return {
		resolveFolder: vi.fn(),
		listFiles: vi.fn().mockResolvedValue(files),
		getThumbnail: vi
			.fn()
			.mockResolvedValue({ body: new Uint8Array([1]), contentType: 'image/jpeg' }),
		getOriginalUrl: vi.fn().mockResolvedValue('https://dl/original'),
		getImageDimensions: vi.fn(async (id: string) => dims[id] ?? null)
	};
}

describe('StorageBackedGalleryService', () => {
	it('filters non-images and sorts by natural name', async () => {
		const storage = fakeStorage([
			{ id: 'id:3', name: 'IMG_10.jpg', version: 'a' },
			{ id: 'id:1', name: 'notes.txt', version: 'b' },
			{ id: 'id:2', name: 'IMG_2.jpg', version: 'c' },
			{ id: 'id:4', name: 'clip.mp4', version: 'd' }
		]);
		const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref);
		expect(gallery.title).toBe('Festival');
		expect(gallery.images.map((i) => i.name)).toEqual(['IMG_2.jpg', 'IMG_10.jpg']);
	});

	it('includes original dimensions for layout-shift prevention', async () => {
		const storage = fakeStorage([{ id: 'id:1', name: 'a.jpg', version: 'v' }], {
			'id:1': { width: 2227, height: 1531 }
		});
		const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref);
		expect(gallery.images[0]).toMatchObject({ width: 2227, height: 1531 });
	});

	it('leaves dimensions undefined when metadata is unavailable', async () => {
		const storage = fakeStorage([{ id: 'id:1', name: 'a.jpg', version: 'v' }]);
		const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref);
		expect(gallery.images[0].width).toBeUndefined();
		expect(gallery.images[0].height).toBeUndefined();
	});

	it('caches the listing across calls (one underlying list)', async () => {
		const storage = fakeStorage([{ id: 'id:1', name: 'a.jpg', version: 'v' }]);
		const service = new StorageBackedGalleryService(storage);
		await service.loadGallery(ref);
		await service.getThumbnail(ref, 'id:1', 'grid');
		expect(storage.listFiles).toHaveBeenCalledTimes(1);
	});

	it('does not fetch dimensions for thumbnail requests', async () => {
		const storage = fakeStorage([{ id: 'id:1', name: 'a.jpg', version: 'v' }]);
		const service = new StorageBackedGalleryService(storage);
		await service.getThumbnail(ref, 'id:1', 'grid');
		expect(storage.getImageDimensions).not.toHaveBeenCalled();
	});

	it('rejects thumbnails for images not in the gallery', async () => {
		const storage = fakeStorage([{ id: 'id:1', name: 'a.jpg', version: 'v' }]);
		const service = new StorageBackedGalleryService(storage);
		await expect(service.getThumbnail(ref, 'id:evil', 'grid')).rejects.toBeInstanceOf(
			ImageNotFoundError
		);
		expect(storage.getThumbnail).not.toHaveBeenCalled();
	});

	it('builds a download-all URL with dl=1', () => {
		const service = new StorageBackedGalleryService(fakeStorage([]));
		expect(service.getDownloadAllUrl(ref)).toBe('https://www.dropbox.com/scl/fo/x?rlkey=y&dl=1');
	});
});
