import type { GalleryService, GalleryRef, Gallery, ResolvedFolder, ThumbSize, ThumbResult } from './types';
import { ImageNotFoundError } from './types';
import type { StorageProvider, StoredFile } from '../storage/types';
import { DropboxStorageProvider } from '../storage/dropbox';
import { isThumbnailableImage, byNaturalName } from '../storage/images';

/** Short cache to coalesce repeated listings (page render + thumbnail requests). */
const LISTING_TTL_MS = 60_000;

export class StorageBackedGalleryService implements GalleryService {
	#storage: StorageProvider;
	#listings = new Map<string, { files: StoredFile[]; expiresAt: number }>();

	constructor(storage: StorageProvider) {
		this.#storage = storage;
	}

	resolveFolder(shareUrl: string): Promise<ResolvedFolder> {
		return this.#storage.resolveFolder(shareUrl);
	}

	async #images(ref: GalleryRef): Promise<StoredFile[]> {
		const cached = this.#listings.get(ref.id);
		if (cached && Date.now() < cached.expiresAt) return cached.files;
		const files = (await this.#storage.listFiles(ref.id))
			.filter((f) => isThumbnailableImage(f.name))
			.sort(byNaturalName);
		this.#listings.set(ref.id, { files, expiresAt: Date.now() + LISTING_TTL_MS });
		return files;
	}

	async loadGallery(ref: GalleryRef): Promise<Gallery> {
		const files = await this.#images(ref);
		return {
			title: ref.title,
			images: files.map((f) => ({ id: f.id, name: f.name, version: f.version }))
		};
	}

	async #assertMember(ref: GalleryRef, imageId: string): Promise<void> {
		const files = await this.#images(ref);
		if (!files.some((f) => f.id === imageId)) throw new ImageNotFoundError(imageId);
	}

	async getThumbnail(ref: GalleryRef, imageId: string, size: ThumbSize): Promise<ThumbResult> {
		await this.#assertMember(ref, imageId);
		return this.#storage.getThumbnail(imageId, size);
	}

	async getOriginalUrl(ref: GalleryRef, imageId: string): Promise<string> {
		await this.#assertMember(ref, imageId);
		return this.#storage.getOriginalUrl(imageId);
	}

	getDownloadAllUrl(ref: GalleryRef): string {
		const url = new URL(ref.shareUrl);
		url.searchParams.set('dl', '1');
		return url.toString();
	}
}

let instance: GalleryService | null = null;

/** The configured gallery service (Dropbox-backed today). */
export function getGalleryService(): GalleryService {
	if (!instance) instance = new StorageBackedGalleryService(new DropboxStorageProvider());
	return instance;
}
