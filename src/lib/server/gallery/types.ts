/**
 * The gallery domain, with no knowledge of any specific storage backend.
 * Routes depend only on this module; Dropbox lives behind a StorageProvider.
 */

export type ThumbSize = 'grid' | 'full';

/** A reference to a folder a gallery is built from. `id` is opaque to callers. */
export interface GalleryRef {
	id: string;
	shareUrl: string;
	title: string;
}

/** A folder resolved from a pasted share link, ready to be minted into a token. */
export interface ResolvedFolder {
	id: string;
	shareUrl: string;
	name: string;
}

export interface ImageDimensions {
	width: number;
	height: number;
}

export interface GalleryImage {
	id: string;
	name: string;
	/** Opaque content version, used purely for cache-busting thumbnail URLs. */
	version: string;
	/** Original pixel dimensions, when known — used to reserve space and avoid layout shift. */
	width?: number;
	height?: number;
}

export interface Gallery {
	title: string;
	images: GalleryImage[];
}

export interface ThumbResult {
	body: Uint8Array;
	contentType: string;
}

/**
 * The single abstraction the app renders galleries through. A DB-backed or
 * cache-backed implementation can replace the storage-backed one later.
 */
export interface GalleryService {
	resolveFolder(shareUrl: string): Promise<ResolvedFolder>;
	loadGallery(ref: GalleryRef): Promise<Gallery>;
	getThumbnail(ref: GalleryRef, imageId: string, size: ThumbSize): Promise<ThumbResult>;
	getOriginalUrl(ref: GalleryRef, imageId: string): Promise<string>;
	getDownloadAllUrl(ref: GalleryRef): string;
}

/** Thrown when a requested image is not part of the given gallery. */
export class ImageNotFoundError extends Error {
	constructor(imageId: string) {
		super(`Image not found in gallery: ${imageId}`);
		this.name = 'ImageNotFoundError';
	}
}
