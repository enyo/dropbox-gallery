import type {
  GalleryService,
  GalleryRef,
  Gallery,
  GalleryImage,
  ResolvedFolder,
  ThumbSize,
  ThumbResult,
} from "./types";
import { ImageNotFoundError } from "./types";
import type { StorageProvider, StoredFile } from "../storage/types";
import { DropboxStorageProvider } from "../storage/dropbox";
import { isThumbnailableImage, byNaturalName } from "../storage/images";

/** Short cache to coalesce repeated work (page render + thumbnail requests). */
const LISTING_TTL_MS = 60_000;
/** Max concurrent metadata calls when resolving image dimensions. */
const DIMENSION_CONCURRENCY = 8;

/** Run `fn` over `items` with a bounded number of concurrent calls, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class StorageBackedGalleryService implements GalleryService {
  #storage: StorageProvider;
  // Cheap listing (no dimensions) — used for membership checks.
  #files = new Map<string, { files: StoredFile[]; expiresAt: number }>();
  // Full gallery incl. dimensions — used to render the page.
  #galleries = new Map<string, { images: GalleryImage[]; expiresAt: number }>();

  constructor(storage: StorageProvider) {
    this.#storage = storage;
  }

  resolveFolder(shareUrl: string): Promise<ResolvedFolder> {
    return this.#storage.resolveFolder(shareUrl);
  }

  async #imageFiles(ref: GalleryRef): Promise<StoredFile[]> {
    const cached = this.#files.get(ref.id);
    if (cached && Date.now() < cached.expiresAt) return cached.files;
    const files = (await this.#storage.listFiles(ref.id))
      .filter((f) => isThumbnailableImage(f.name))
      .sort(byNaturalName);
    this.#files.set(ref.id, { files, expiresAt: Date.now() + LISTING_TTL_MS });
    return files;
  }

  async #galleryImages(ref: GalleryRef): Promise<GalleryImage[]> {
    const cached = this.#galleries.get(ref.id);
    if (cached && Date.now() < cached.expiresAt) return cached.images;

    const files = await this.#imageFiles(ref);
    // Per-image metadata gives original dimensions so the grid can reserve space (no CLS).
    const dimensions = await mapPool(files, DIMENSION_CONCURRENCY, (f) =>
      this.#storage.getImageDimensions(f.id).catch(() => null),
    );
    const images: GalleryImage[] = files.map((f, i) => ({
      id: f.id,
      name: f.name,
      version: f.version,
      width: dimensions[i]?.width,
      height: dimensions[i]?.height,
    }));
    this.#galleries.set(ref.id, { images, expiresAt: Date.now() + LISTING_TTL_MS });
    return images;
  }

  async loadGallery(ref: GalleryRef): Promise<Gallery> {
    const all = await this.#galleryImages(ref);
    // The cover is the file named by ref.coverImage, falling back to the first
    // image when that name is unset or no longer present in the folder.
    const cover = all.find((img) => img.name === ref.coverImage) ?? all[0] ?? null;
    // When excluded, the cover shows only as the hero — drop it from the grid.
    const images = ref.coverExcluded && cover ? all.filter((img) => img.id !== cover.id) : all;
    return { title: ref.title, cover, images };
  }

  async #assertMember(ref: GalleryRef, imageId: string): Promise<void> {
    // Membership uses the cheap listing, so thumbnail requests skip metadata fan-out.
    const files = await this.#imageFiles(ref);
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
    url.searchParams.set("dl", "1");
    return url.toString();
  }
}

let instance: GalleryService | null = null;

/** The configured gallery service (Dropbox-backed today). */
export function getGalleryService(): GalleryService {
  if (!instance) instance = new StorageBackedGalleryService(new DropboxStorageProvider());
  return instance;
}
