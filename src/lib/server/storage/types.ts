import type { ThumbSize, ThumbResult, ResolvedFolder, ImageDimensions } from '../gallery/types';

/** A file as seen by a storage backend. */
export interface StoredFile {
	id: string;
	name: string;
	/** Opaque content version for cache-busting (e.g. content hash). */
	version: string;
}

/**
 * Low-level, backend-agnostic file access. Dropbox is the only implementation
 * today; the gallery service depends on this interface, not on Dropbox.
 */
export interface StorageProvider {
	/** Resolve a pasted share link into a stable folder reference. */
	resolveFolder(shareUrl: string): Promise<ResolvedFolder>;
	/** List all files (any type) directly inside the folder. */
	listFiles(folderId: string): Promise<StoredFile[]>;
	/** Fetch a downscaled JPEG for a file. */
	getThumbnail(fileId: string, size: ThumbSize): Promise<ThumbResult>;
	/** A short-lived direct URL to download the original file. */
	getOriginalUrl(fileId: string): Promise<string>;
	/** Original pixel dimensions of an image, or null if unavailable. */
	getImageDimensions(fileId: string): Promise<ImageDimensions | null>;
}
