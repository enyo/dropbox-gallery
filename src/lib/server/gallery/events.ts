/**
 * D1-backed engagement counters for galleries. Each viewer action — opening an
 * image (zoom), downloading an original, or using "download all" — bumps a
 * counter, so the admin can see which photos drew interest. See ADR-0007.
 *
 * The image reference is the plain Dropbox filename, not a foreign key: there is
 * nothing to reference (galleries are listed live from Dropbox; see ADR-0005).
 * If a photo is renamed or deleted its counter simply dangles, naming a file no
 * longer in the folder — the admin view flags those as removed.
 *
 * Increments are conflict-free under concurrent clicks: each is a single atomic
 * `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1`, which SQLite/D1
 * serialises. A JSON blob updated in application code would instead read, modify,
 * and write back, losing increments when two clicks race.
 */
import type { D1Database } from "@cloudflare/workers-types";
import { getDb } from "../db";

/** The viewer actions we count. `download_all` is gallery-wide (names no image). */
export type GalleryEventType = "zoom" | "download" | "download_all";

const GALLERY_EVENT_TYPES: readonly GalleryEventType[] = ["zoom", "download", "download_all"];

/** Sentinel `image_ref` for gallery-wide events (download all), which name no image. */
const GALLERY_WIDE = "";

/** A raw counter row, as selected for aggregation. */
export interface EventRow {
  image_ref: string;
  event_type: string;
  count: number;
}

/** Per-image engagement, keyed by the filename recorded at click time. */
export interface ImageStats {
  name: string;
  zooms: number;
  downloads: number;
}

/** Aggregated engagement for one gallery, ready for the admin view. */
export interface GallerySummary {
  /** Times "download all" was used. */
  downloadAll: number;
  /** Total single-image downloads, summed across images. */
  totalDownloads: number;
  /** Total image opens (zooms), summed across images. */
  totalZooms: number;
  /** Per-image breakdown, most-engaged first. */
  perImage: ImageStats[];
}

/** True for a value that is one of the countable event types. */
export function isGalleryEventType(value: unknown): value is GalleryEventType {
  return typeof value === "string" && (GALLERY_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Fold raw counter rows into a gallery summary. Pure and DB-free so the
 * aggregation is unit-testable. Gallery-wide rows feed the `download_all` total;
 * per-image rows are grouped by filename and sorted most-engaged first.
 */
export function summarizeRows(rows: EventRow[]): GallerySummary {
  let downloadAll = 0;
  const byImage = new Map<string, ImageStats>();

  for (const row of rows) {
    if (row.event_type === "download_all") {
      downloadAll += row.count;
      continue;
    }
    if (row.image_ref === GALLERY_WIDE) continue; // malformed per-image row; ignore
    let stats = byImage.get(row.image_ref);
    if (!stats) {
      stats = { name: row.image_ref, zooms: 0, downloads: 0 };
      byImage.set(row.image_ref, stats);
    }
    if (row.event_type === "zoom") stats.zooms += row.count;
    else if (row.event_type === "download") stats.downloads += row.count;
  }

  const perImage = [...byImage.values()].sort(
    (a, b) => b.downloads - a.downloads || b.zooms - a.zooms || a.name.localeCompare(b.name),
  );
  const totalDownloads = perImage.reduce((n, s) => n + s.downloads, 0);
  const totalZooms = perImage.reduce((n, s) => n + s.zooms, 0);
  return { downloadAll, totalDownloads, totalZooms, perImage };
}

export class EventStore {
  #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  /**
   * Record one occurrence of `type`. `imageName` is required for `zoom`/`download`
   * and ignored for `download_all`. A single atomic upsert, so concurrent clicks
   * never lose an increment.
   */
  async record(
    galleryId: string,
    type: GalleryEventType,
    imageName: string | null,
    now = Date.now(),
  ): Promise<void> {
    const ref = type === "download_all" ? GALLERY_WIDE : (imageName ?? GALLERY_WIDE);
    await this.#db
      .prepare(
        `INSERT INTO gallery_events (gallery_id, image_ref, event_type, count, updated_at)
				 VALUES (?, ?, ?, 1, ?)
				 ON CONFLICT (gallery_id, image_ref, event_type)
				 DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
      )
      .bind(galleryId, ref, type, now)
      .run();
  }

  /** Aggregate every counter for a gallery into a summary for the admin view. */
  async summarize(galleryId: string): Promise<GallerySummary> {
    const { results } = await this.#db
      .prepare(`SELECT image_ref, event_type, count FROM gallery_events WHERE gallery_id = ?`)
      .bind(galleryId)
      .all<EventRow>();
    return summarizeRows(results);
  }

  /** Drop every counter for a gallery. Called when the gallery itself is deleted. */
  async deleteForGallery(galleryId: string): Promise<void> {
    await this.#db.prepare(`DELETE FROM gallery_events WHERE gallery_id = ?`).bind(galleryId).run();
  }
}

/** The event store for the current request (see `getDb` for how the binding is resolved). */
export function getEventStore(platform: App.Platform | undefined): EventStore {
  return new EventStore(getDb(platform));
}
