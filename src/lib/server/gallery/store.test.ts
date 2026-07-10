import { describe, it, expect } from "vitest";
import {
  resolveRow,
  newGalleryId,
  normalizeSlug,
  isValidSlug,
  decideSlugClaim,
  slugHash,
  parseSlugPath,
  galleryPath,
} from "./store";

const baseRow = {
  id: "abc",
  folder_id: "id:folder",
  share_url: "https://www.dropbox.com/scl/fo/x?rlkey=y&dl=0",
  title: "Festival",
  created_at: 1000,
  expires_at: null as number | null,
  revoked_at: null as number | null,
  cover_image: null as string | null,
  cover_excluded: 0,
};

describe("resolveRow", () => {
  it("returns the gallery ref for a live row", () => {
    const result = resolveRow(baseRow, 5000);
    expect(result).toEqual({
      status: "ok",
      ref: {
        id: "id:folder",
        shareUrl: baseRow.share_url,
        title: "Festival",
        coverImage: null,
        coverExcluded: false,
      },
    });
  });

  it("carries the cover choice into the ref", () => {
    const row = { ...baseRow, cover_image: "hero.jpg", cover_excluded: 1 };
    const result = resolveRow(row, 5000);
    expect(result).toMatchObject({
      status: "ok",
      ref: { coverImage: "hero.jpg", coverExcluded: true },
    });
  });

  it("treats a missing row as not-found", () => {
    expect(resolveRow(null, 5000)).toEqual({ status: "not-found" });
  });

  it("reports revoked rows as revoked, even before expiry", () => {
    const row = { ...baseRow, revoked_at: 2000, expires_at: 9999 };
    expect(resolveRow(row, 5000)).toEqual({ status: "revoked" });
  });

  it("reports expiry only after the expiry instant", () => {
    const row = { ...baseRow, expires_at: 5000 };
    expect(resolveRow(row, 5000).status).toBe("ok"); // not yet past
    expect(resolveRow(row, 5001).status).toBe("expired");
  });

  it("never expires a row with a null expiry", () => {
    expect(resolveRow({ ...baseRow, expires_at: null }, Number.MAX_SAFE_INTEGER).status).toBe("ok");
  });
});

describe("newGalleryId", () => {
  it("is URL-safe, 128-bit, and unique across calls", () => {
    const a = newGalleryId();
    const b = newGalleryId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/); // base64url of 16 bytes
  });
});

describe("normalizeSlug", () => {
  it("trims and lowercases so stored and typed forms match", () => {
    expect(normalizeSlug("  Summer-2026 ")).toBe("summer-2026");
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase-alphanumeric words joined by single hyphens", () => {
    expect(isValidSlug("summer-2026")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("2026")).toBe(true);
  });

  it("rejects empty, spaced, uppercase, and badly-hyphenated slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("Summer")).toBe(false); // caller normalises first, but guard anyway
    expect(isValidSlug("summer 2026")).toBe(false);
    expect(isValidSlug("-summer")).toBe(false);
    expect(isValidSlug("summer-")).toBe(false);
    expect(isValidSlug("summer--2026")).toBe(false);
    expect(isValidSlug("déjà")).toBe(false);
  });

  it("rejects slugs longer than 64 chars", () => {
    expect(isValidSlug("a".repeat(64))).toBe(true);
    expect(isValidSlug("a".repeat(65))).toBe(false);
  });
});

describe("slugHash", () => {
  it("is a five-digit decimal code, zero-padded", () => {
    for (let i = 0; i < 50; i++) {
      expect(slugHash(newGalleryId())).toMatch(/^\d{5}$/);
    }
  });

  it("is deterministic for a given id", () => {
    const id = newGalleryId();
    expect(slugHash(id)).toBe(slugHash(id));
  });

  it("generally differs between ids", () => {
    // Not a guarantee (collisions exist in a 100k space), but two random ids should
    // almost never collide — a broken hash returning a constant would fail this.
    expect(slugHash("aaaaaaaaaaaaaaaaaaaaaa")).not.toBe(slugHash("bbbbbbbbbbbbbbbbbbbbbb"));
  });
});

describe("parseSlugPath", () => {
  it("splits a five-digit hash from the slug, keeping hyphens in the slug", () => {
    expect(parseSlugPath("04213-summer-2026")).toEqual({ hash: "04213", slug: "summer-2026" });
  });

  it("rejects a missing, short, or long hash prefix", () => {
    expect(parseSlugPath("summer-2026")).toBeNull(); // bare slug — no hash
    expect(parseSlugPath("4213-summer")).toBeNull(); // four digits
    expect(parseSlugPath("042135-summer")).toBeNull(); // six digits
  });

  it("rejects a valid hash followed by an invalid slug", () => {
    expect(parseSlugPath("04213-Summer")).toBeNull(); // uppercase
    expect(parseSlugPath("04213-")).toBeNull(); // empty slug
    expect(parseSlugPath("04213--x")).toBeNull(); // doubled hyphen
  });
});

describe("galleryPath", () => {
  it("is the bare id when the gallery has no slug", () => {
    expect(galleryPath("cap-id", null)).toBe("/cap-id");
  });

  it("prefixes the id hash when the gallery has an active slug", () => {
    expect(galleryPath("cap-id", "summer-2026")).toBe(`/${slugHash("cap-id")}-summer-2026`);
  });
});

describe("decideSlugClaim", () => {
  it("inserts a slug nobody holds", () => {
    expect(decideSlugClaim("g1", null)).toEqual({ action: "insert" });
  });

  it("is a no-op when it is already this gallery’s active slug", () => {
    expect(decideSlugClaim("g1", { galleryId: "g1", isActive: true })).toEqual({ action: "noop" });
  });

  it("reclaims (re-activates) this gallery’s own stale slug", () => {
    expect(decideSlugClaim("g1", { galleryId: "g1", isActive: false })).toEqual({
      action: "reclaim",
    });
  });

  it("claims another gallery’s stale slug", () => {
    expect(decideSlugClaim("g1", { galleryId: "g2", isActive: false })).toEqual({
      action: "reclaim",
    });
  });

  it("rejects another gallery’s active slug", () => {
    expect(decideSlugClaim("g1", { galleryId: "g2", isActive: true })).toEqual({
      action: "reject",
    });
  });
});
