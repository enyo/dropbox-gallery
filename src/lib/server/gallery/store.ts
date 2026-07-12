/**
 * D1-backed persistence for galleries. A gallery row's primary key is the
 * Gallery Link capability itself: an unguessable random id that appears in the
 * URL as `/<id>`. Persisting galleries (instead of encoding them into signed
 * tokens) is what makes per-link revocation and an admin listing possible.
 * See ADR-0003.
 */
import type { D1Database } from "@cloudflare/workers-types";
import type { GalleryRef } from "./types";
import { getDb } from "../db";

/** A gallery as stored, in camelCase. Used by the admin listing. */
export interface GalleryRecord {
  id: string;
  folderId: string;
  shareUrl: string;
  title: string;
  createdAt: number;
  /** Epoch ms, or null for never. */
  expiresAt: number | null;
  /** Epoch ms when revoked, or null while live. */
  revokedAt: number | null;
  /** Filename of the chosen cover image, or null to fall back to the first image. */
  coverImage: string | null;
  /** When true, the resolved cover is dropped from the grid (shown only as the hero). */
  coverExcluded: boolean;
  /** When false, the gallery offers a viewer no downloads at all. */
  downloadsEnabled: boolean;
}

/** The raw D1 row shape (snake_case columns). */
interface GalleryRow {
  id: string;
  folder_id: string;
  share_url: string;
  title: string;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  cover_image: string | null;
  cover_excluded: number;
  downloads_enabled: number;
}

/**
 * Outcome of resolving a `/<id>` capability, distinguishing why access failed.
 *
 * `downloadsEnabled` rides on the successful lookup rather than on the `GalleryRef`
 * because it governs what the link permits — like expiry and revocation — and not how
 * the gallery is rendered from its folder. The download routes therefore learn it from
 * the same resolve they already do, without the gallery service having to know about it.
 */
export type GalleryLookup =
  | { status: "ok"; ref: GalleryRef; downloadsEnabled: boolean }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "not-found" };

/**
 * Resolving a public gallery path, carrying the canonical gallery id alongside the
 * lookup. `galleryId` is set whenever the path named a real gallery (even an expired or
 * revoked one), so callers that key data by gallery id — e.g. engagement counters — can
 * do so under the canonical id no matter which slug the viewer arrived on.
 */
export interface PathLookup {
  lookup: GalleryLookup;
  galleryId: string | null;
}

/** The raw `gallery_slugs` row shape. */
interface SlugRow {
  slug: string;
  gallery_id: string;
  created_at: number;
}

/** What setting a slug on a gallery should do, given the slug's current state. */
export type SlugClaim =
  | { action: "insert" } // no such slug yet — create it
  | { action: "reclaim" } // exists but is claimable — reassign it (becomes active)
  | { action: "noop" } // already this gallery's active slug — nothing to do
  | { action: "reject" }; // is another gallery's active slug — cannot take it

/** Outcome of {@link GalleryStore.addSlug}. */
export type AddSlugResult = { ok: true } | { ok: false; reason: "invalid" | "taken" };

/** Longest slug we store — comfortably longer than any sensible link name. */
const MAX_SLUG_LENGTH = 64;

/**
 * Normalise operator input into canonical slug form: trimmed and lowercased. The
 * displayed and stored forms then always match, so reclaiming an old slug means typing
 * what you see.
 */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * A valid slug is one or more lowercase-alphanumeric groups joined by single hyphens
 * (so no leading, trailing, or doubled hyphens), at most {@link MAX_SLUG_LENGTH} chars.
 * Kept deliberately narrow so a slug is always a clean, unambiguous URL segment.
 */
export function isValidSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * The canonical public path a gallery settles on: `/<slug>` when it has an active slug,
 * otherwise the bare `/<id>`. The single place the public URL shape is built, shared by the
 * page's canonical redirect and every admin-facing link.
 */
export function galleryPath(galleryId: string, activeSlug: string | null): string {
  return activeSlug ? `/${activeSlug}` : `/${galleryId}`;
}

/**
 * Decide what setting `slug` for `galleryId` should do, given the existing slug's owner
 * and whether it is that owner's active slug. Pure, so the claim rules are unit-testable
 * without a database:
 *   - unknown slug            → insert
 *   - your own active slug    → no-op (already set)
 *   - your own stale slug     → reclaim (re-activates it)
 *   - another gallery's stale → reclaim (allowed: stale slugs are up for grabs)
 *   - another gallery's active→ reject (an active slug can never be stolen)
 */
export function decideSlugClaim(
  galleryId: string,
  existing: { galleryId: string; isActive: boolean } | null,
): SlugClaim {
  if (!existing) return { action: "insert" };
  if (existing.galleryId === galleryId) {
    return existing.isActive ? { action: "noop" } : { action: "reclaim" };
  }
  return existing.isActive ? { action: "reject" } : { action: "reclaim" };
}

function toRecord(row: GalleryRow): GalleryRecord {
  return {
    id: row.id,
    folderId: row.folder_id,
    shareUrl: row.share_url,
    title: row.title,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    coverImage: row.cover_image,
    coverExcluded: row.cover_excluded === 1,
    downloadsEnabled: row.downloads_enabled === 1,
  };
}

/**
 * Decide whether a looked-up row grants access. Pure and time-injectable so the
 * expiry/revocation rules can be unit-tested without a live database.
 */
export function resolveRow(row: GalleryRow | null, now: number): GalleryLookup {
  if (!row) return { status: "not-found" };
  if (row.revoked_at !== null) return { status: "revoked" };
  if (row.expires_at !== null && now > row.expires_at) return { status: "expired" };
  return {
    status: "ok",
    ref: {
      id: row.folder_id,
      shareUrl: row.share_url,
      title: row.title,
      coverImage: row.cover_image,
      coverExcluded: row.cover_excluded === 1,
    },
    downloadsEnabled: row.downloads_enabled === 1,
  };
}

/** Generate a 128-bit unguessable capability id, URL-safe (22 base64url chars). */
export function newGalleryId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Buffer.from(bytes).toString("base64url");
}

export class GalleryStore {
  #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  /** Persist a new gallery and return its capability id (the `/<id>` value). */
  async create(input: {
    folderId: string;
    shareUrl: string;
    title: string;
    expiresAt: number | null;
  }): Promise<string> {
    const id = newGalleryId();
    await this.#db
      .prepare(
        `INSERT INTO galleries (id, folder_id, share_url, title, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.folderId, input.shareUrl, input.title, Date.now(), input.expiresAt)
      .run();
    return id;
  }

  async #rowById(id: string): Promise<GalleryRow | null> {
    return this.#db.prepare(`SELECT * FROM galleries WHERE id = ?`).bind(id).first<GalleryRow>();
  }

  async #slugRow(slug: string): Promise<SlugRow | null> {
    return this.#db
      .prepare(`SELECT * FROM gallery_slugs WHERE slug = ?`)
      .bind(slug)
      .first<SlugRow>();
  }

  /**
   * Resolve a public path segment to a gallery. Two forms resolve, and the id always
   * wins: the bare capability id (`/<id>`), used directly on a match; and a slug
   * (`/<slug>`), tried only when no gallery has that id. Any known slug resolves here —
   * active or stale — so assets and beacons keep working even on an old slug; the page
   * route is what redirects a stale slug to the active one.
   */
  async resolveByPath(segment: string, now = Date.now()): Promise<PathLookup> {
    const byId = await this.#rowById(segment);
    if (byId) return { lookup: resolveRow(byId, now), galleryId: byId.id };

    // A segment that can't be a slug can't name a gallery either — no need to hit D1.
    if (!isValidSlug(segment)) return { lookup: { status: "not-found" }, galleryId: null };

    const slug = await this.#slugRow(segment);
    if (!slug) return { lookup: { status: "not-found" }, galleryId: null };
    const row = await this.#rowById(slug.gallery_id);
    if (!row) return { lookup: { status: "not-found" }, galleryId: null }; // dangling slug
    return { lookup: resolveRow(row, now), galleryId: row.id };
  }

  /** The active (newest) slug for a gallery, or null when it has none. */
  async activeSlug(galleryId: string): Promise<string | null> {
    const row = await this.#db
      .prepare(
        `SELECT slug FROM gallery_slugs WHERE gallery_id = ?
				 ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .bind(galleryId)
      .first<{ slug: string }>();
    return row?.slug ?? null;
  }

  /** Every slug for a gallery, newest (active) first. */
  async slugsFor(galleryId: string): Promise<string[]> {
    const { results } = await this.#db
      .prepare(
        `SELECT slug FROM gallery_slugs WHERE gallery_id = ?
				 ORDER BY created_at DESC, rowid DESC`,
      )
      .bind(galleryId)
      .all<{ slug: string }>();
    return results.map((r) => r.slug);
  }

  /**
   * The active slug of every gallery that has one, keyed by gallery id. One scan feeds
   * the admin listing so each row can show its prettiest URL without an N+1 of lookups.
   */
  async activeSlugByGallery(): Promise<Map<string, string>> {
    const { results } = await this.#db
      .prepare(`SELECT gallery_id, slug FROM gallery_slugs ORDER BY created_at DESC, rowid DESC`)
      .all<{ gallery_id: string; slug: string }>();
    const map = new Map<string, string>();
    for (const r of results) if (!map.has(r.gallery_id)) map.set(r.gallery_id, r.slug);
    return map;
  }

  /**
   * Add (or re-activate) a slug for a gallery, enforcing the claim rules in
   * {@link decideSlugClaim}. The freshly written row is the newest, so it becomes the
   * gallery's active slug. Returns why it was rejected when it cannot be claimed.
   */
  async addSlug(galleryId: string, rawSlug: string, now = Date.now()): Promise<AddSlugResult> {
    const slug = normalizeSlug(rawSlug);
    if (!isValidSlug(slug)) return { ok: false, reason: "invalid" };

    const existingRow = await this.#slugRow(slug);
    const existing = existingRow
      ? {
          galleryId: existingRow.gallery_id,
          isActive: (await this.activeSlug(existingRow.gallery_id)) === slug,
        }
      : null;

    const decision = decideSlugClaim(galleryId, existing);
    if (decision.action === "reject") return { ok: false, reason: "taken" };
    if (decision.action === "noop") return { ok: true };

    // Reclaiming deletes the old row first, so the re-inserted one gets a fresh rowid
    // and created_at and is unambiguously the newest — hence active — slug.
    const insert = this.#db
      .prepare(`INSERT INTO gallery_slugs (slug, gallery_id, created_at) VALUES (?, ?, ?)`)
      .bind(slug, galleryId, now);
    if (decision.action === "reclaim") {
      await this.#db.batch([
        this.#db.prepare(`DELETE FROM gallery_slugs WHERE slug = ?`).bind(slug),
        insert,
      ]);
    } else {
      await insert.run();
    }
    return { ok: true };
  }

  /**
   * Fetch a gallery record by id regardless of status. Unlike `resolve`, this
   * returns expired and revoked galleries too, so the admin can still inspect,
   * edit, or delete them. Returns null when no such row exists.
   */
  async get(id: string): Promise<GalleryRecord | null> {
    const row = await this.#db
      .prepare(`SELECT * FROM galleries WHERE id = ?`)
      .bind(id)
      .first<GalleryRow>();
    return row ? toRecord(row) : null;
  }

  /** All galleries, newest first — including expired/revoked ones, for the admin view. */
  async list(): Promise<GalleryRecord[]> {
    const { results } = await this.#db
      .prepare(`SELECT * FROM galleries ORDER BY created_at DESC`)
      .all<GalleryRow>();
    return results.map(toRecord);
  }

  /** Revoke a live gallery. Returns true if a live row was revoked, false otherwise. */
  async revoke(id: string, now = Date.now()): Promise<boolean> {
    const { meta } = await this.#db
      .prepare(`UPDATE galleries SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
      .bind(now, id)
      .run();
    return meta.changes > 0;
  }

  /**
   * Update a gallery's editable settings (title, expiry, and whether viewers may
   * download). Returns true if the row exists.
   */
  async update(
    id: string,
    fields: { title: string; expiresAt: number | null; downloadsEnabled: boolean },
  ): Promise<boolean> {
    const { meta } = await this.#db
      .prepare(`UPDATE galleries SET title = ?, expires_at = ?, downloads_enabled = ? WHERE id = ?`)
      .bind(fields.title, fields.expiresAt, fields.downloadsEnabled ? 1 : 0, id)
      .run();
    return meta.changes > 0;
  }

  /**
   * Set (or clear) the cover image by filename. Pass null to clear, which makes the
   * gallery fall back to its first image. Returns true if the row exists.
   */
  async setCover(id: string, coverImage: string | null): Promise<boolean> {
    const { meta } = await this.#db
      .prepare(`UPDATE galleries SET cover_image = ? WHERE id = ?`)
      .bind(coverImage, id)
      .run();
    return meta.changes > 0;
  }

  /** Toggle whether the resolved cover is excluded from the grid. Returns true if the row exists. */
  async setCoverExcluded(id: string, excluded: boolean): Promise<boolean> {
    const { meta } = await this.#db
      .prepare(`UPDATE galleries SET cover_excluded = ? WHERE id = ?`)
      .bind(excluded ? 1 : 0, id)
      .run();
    return meta.changes > 0;
  }

  /**
   * Permanently delete a gallery row and all of its slugs. The capability id and every
   * slug become unresolvable (a 404, not a 410 like revocation). Returns true if the
   * gallery row was removed.
   */
  async delete(id: string): Promise<boolean> {
    const [, gallery] = await this.#db.batch([
      this.#db.prepare(`DELETE FROM gallery_slugs WHERE gallery_id = ?`).bind(id),
      this.#db.prepare(`DELETE FROM galleries WHERE id = ?`).bind(id),
    ]);
    return gallery.meta.changes > 0;
  }
}

/** The gallery store for the current request (see `getDb` for how the binding is resolved). */
export function getGalleryStore(platform: App.Platform | undefined): GalleryStore {
  return new GalleryStore(getDb(platform));
}
