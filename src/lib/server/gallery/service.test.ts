import { describe, it, expect, vi } from "vitest";
import { StorageBackedGalleryService } from "./service";
import { ImageNotFoundError } from "./types";
import type { GalleryRef } from "./types";
import type { DimensionCache, MeasuredImage } from "./dimensions";
import type { StorageProvider, StoredFile } from "../storage/types";

const ref: GalleryRef = {
  id: "/test/festival",
  shareUrl: "https://www.dropbox.com/scl/fo/x?rlkey=y&dl=0",
  title: "Festival",
  coverImage: null,
  coverExcluded: false,
};

function fakeStorage(
  files: StoredFile[],
  dims: Record<string, { width: number; height: number }> = {},
): StorageProvider {
  return {
    resolveFolder: vi.fn(),
    listFiles: vi.fn().mockResolvedValue(files),
    getThumbnail: vi
      .fn()
      .mockResolvedValue({ body: new Uint8Array([1]), contentType: "image/jpeg" }),
    getOriginalUrl: vi.fn().mockResolvedValue("https://dl/original"),
    getImageDimensions: vi.fn(async (id: string) => dims[id] ?? null),
  };
}

/** An in-memory stand-in for the D1-backed cache, keyed the same way (id + version). */
function fakeCache(): DimensionCache & { stored: Map<string, MeasuredImage> } {
  const stored = new Map<string, MeasuredImage>();
  const key = (f: { id: string; version: string }) => `${f.id}@${f.version}`;
  return {
    stored,
    async read(files) {
      const known = new Map();
      for (const f of files) {
        const hit = stored.get(key(f));
        if (hit) known.set(f.id, { width: hit.width, height: hit.height });
      }
      return known;
    },
    async write(images) {
      for (const img of images) stored.set(key(img), img);
    },
  };
}

const manyFiles = (n: number): StoredFile[] =>
  Array.from({ length: n }, (_, i) => ({ id: `id:${i}`, name: `p${i}.jpg`, version: "v" }));

const portrait = (files: StoredFile[]) =>
  Object.fromEntries(files.map((f) => [f.id, { width: 3840, height: 5120 }]));

describe("StorageBackedGalleryService", () => {
  it("filters non-images and sorts by natural name", async () => {
    const storage = fakeStorage([
      { id: "id:3", name: "IMG_10.jpg", version: "a" },
      { id: "id:1", name: "notes.txt", version: "b" },
      { id: "id:2", name: "IMG_2.jpg", version: "c" },
      { id: "id:4", name: "clip.mp4", version: "d" },
    ]);
    const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref);
    expect(gallery.title).toBe("Festival");
    expect(gallery.images.map((i) => i.name)).toEqual(["IMG_2.jpg", "IMG_10.jpg"]);
  });

  it("includes original dimensions for layout-shift prevention", async () => {
    const storage = fakeStorage([{ id: "id:1", name: "a.jpg", version: "v" }], {
      "id:1": { width: 2227, height: 1531 },
    });
    const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref);
    expect(gallery.images[0]).toMatchObject({ width: 2227, height: 1531 });
  });

  it("leaves dimensions undefined when metadata is unavailable", async () => {
    const storage = fakeStorage([{ id: "id:1", name: "a.jpg", version: "v" }]);
    const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref);
    expect(gallery.images[0].width).toBeUndefined();
    expect(gallery.images[0].height).toBeUndefined();
  });

  it("caches the listing across calls (one underlying list)", async () => {
    const storage = fakeStorage([{ id: "id:1", name: "a.jpg", version: "v" }]);
    const service = new StorageBackedGalleryService(storage);
    await service.loadGallery(ref);
    await service.getThumbnail(ref, "id:1", "grid");
    expect(storage.listFiles).toHaveBeenCalledTimes(1);
  });

  it("does not fetch dimensions for thumbnail requests", async () => {
    const storage = fakeStorage([{ id: "id:1", name: "a.jpg", version: "v" }]);
    const service = new StorageBackedGalleryService(storage);
    await service.getThumbnail(ref, "id:1", "grid");
    expect(storage.getImageDimensions).not.toHaveBeenCalled();
  });

  it("rejects thumbnails for images not in the gallery", async () => {
    const storage = fakeStorage([{ id: "id:1", name: "a.jpg", version: "v" }]);
    const service = new StorageBackedGalleryService(storage);
    await expect(service.getThumbnail(ref, "id:evil", "grid")).rejects.toBeInstanceOf(
      ImageNotFoundError,
    );
    expect(storage.getThumbnail).not.toHaveBeenCalled();
  });

  it("defaults the cover to the first image when none is chosen", async () => {
    const storage = fakeStorage([
      { id: "id:2", name: "IMG_2.jpg", version: "c" },
      { id: "id:3", name: "IMG_10.jpg", version: "a" },
    ]);
    const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref);
    expect(gallery.cover?.name).toBe("IMG_2.jpg");
    // Not excluded, so the cover still appears in the grid.
    expect(gallery.images.map((i) => i.name)).toEqual(["IMG_2.jpg", "IMG_10.jpg"]);
  });

  it("resolves the cover by filename and can exclude it from the grid", async () => {
    const storage = fakeStorage([
      { id: "id:2", name: "IMG_2.jpg", version: "c" },
      { id: "id:3", name: "IMG_10.jpg", version: "a" },
    ]);
    const withCover = { ...ref, coverImage: "IMG_10.jpg", coverExcluded: true };
    const gallery = await new StorageBackedGalleryService(storage).loadGallery(withCover);
    expect(gallery.cover?.name).toBe("IMG_10.jpg");
    expect(gallery.images.map((i) => i.name)).toEqual(["IMG_2.jpg"]);
  });

  it("falls back to the first image when the chosen cover is gone", async () => {
    const storage = fakeStorage([{ id: "id:1", name: "a.jpg", version: "v" }]);
    const withCover = { ...ref, coverImage: "deleted.jpg", coverExcluded: true };
    const gallery = await new StorageBackedGalleryService(storage).loadGallery(withCover);
    expect(gallery.cover?.name).toBe("a.jpg");
    // The fallback cover is still excluded from the grid.
    expect(gallery.images).toEqual([]);
  });

  it("has a null cover for an empty gallery", async () => {
    const gallery = await new StorageBackedGalleryService(fakeStorage([])).loadGallery(ref);
    expect(gallery.cover).toBeNull();
    expect(gallery.images).toEqual([]);
  });

  it("builds a download-all URL with dl=1", () => {
    const service = new StorageBackedGalleryService(fakeStorage([]));
    expect(service.getDownloadAllUrl(ref)).toBe("https://www.dropbox.com/scl/fo/x?rlkey=y&dl=1");
  });

  // Each unmeasured photo costs one external subrequest, and a Worker invocation only
  // gets 50. These four pin the behaviour that keeps a large gallery under that ceiling
  // — and, once measured, off Dropbox entirely.
  it("measures a photo once and serves every later render from the cache", async () => {
    const files = [{ id: "id:1", name: "a.jpg", version: "v" }];
    const cache = fakeCache();
    const first = fakeStorage(files, { "id:1": { width: 3840, height: 5120 } });
    await new StorageBackedGalleryService(first).loadGallery(ref, cache);
    expect(first.getImageDimensions).toHaveBeenCalledTimes(1);

    // A fresh service stands in for a fresh Worker isolate: no in-memory state, so a
    // second render only stays off Dropbox if the measurement really was persisted.
    const second = fakeStorage(files);
    const gallery = await new StorageBackedGalleryService(second).loadGallery(ref, cache);
    expect(second.getImageDimensions).not.toHaveBeenCalled();
    expect(gallery.images[0]).toMatchObject({ width: 3840, height: 5120 });
  });

  it("caps how many photos one render measures, whatever the gallery's size", async () => {
    const files = manyFiles(200);
    const storage = fakeStorage(files, portrait(files));
    await new StorageBackedGalleryService(storage).loadGallery(ref, fakeCache());
    // The old code called this 200 times; everything past the 50th threw "Too many
    // subrequests" and the gallery's whole tail came back with no dimensions.
    expect((storage.getImageDimensions as ReturnType<typeof vi.fn>).mock.calls.length).toBe(40);
  });

  it("measures the next batch on each render until the gallery is fully measured", async () => {
    const files = manyFiles(100);
    const cache = fakeCache();
    const dims = portrait(files);

    for (let render = 1; render <= 3; render++) {
      const storage = fakeStorage(files, dims);
      const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref, cache);
      const sized = gallery.images.filter((i) => i.width && i.height);
      expect(sized.length).toBe(Math.min(40 * render, 100));
      // Every photo that is sized is sized correctly — a portrait stays portrait.
      expect(sized.every((i) => i.width! < i.height!)).toBe(true);
    }
  });

  it("re-measures a photo whose content changed", async () => {
    const cache = fakeCache();
    const before = [{ id: "id:1", name: "a.jpg", version: "v1" }];
    await new StorageBackedGalleryService(
      fakeStorage(before, { "id:1": { width: 100, height: 200 } }),
    ).loadGallery(ref, cache);

    // Same file id, new content hash: the stored measurement describes bytes that no
    // longer exist, so it must not be reused.
    const after = [{ id: "id:1", name: "a.jpg", version: "v2" }];
    const storage = fakeStorage(after, { "id:1": { width: 400, height: 300 } });
    const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref, cache);
    expect(storage.getImageDimensions).toHaveBeenCalledTimes(1);
    expect(gallery.images[0]).toMatchObject({ width: 400, height: 300 });
  });

  it("leaves dimensions undefined, rather than guessing, when a measurement fails", async () => {
    const files = [{ id: "id:1", name: "a.jpg", version: "v" }];
    const storage = fakeStorage(files);
    storage.getImageDimensions = vi.fn().mockRejectedValue(new Error("Too many subrequests."));
    const gallery = await new StorageBackedGalleryService(storage).loadGallery(ref, fakeCache());
    expect(gallery.images[0].width).toBeUndefined();
  });
});
