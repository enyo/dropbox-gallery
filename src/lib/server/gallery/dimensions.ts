/**
 * A durable record of how big each image is.
 *
 * Reading dimensions from Dropbox costs one external call per photo (see
 * `migrations/0006_create_image_dimensions.sql` for why there is no batch call, and
 * what the resulting subrequest blowout looked like). Since dimensions are fixed by
 * the file's content, measuring is a one-time cost per version: everything after the
 * first render is served from here, and a gallery renders with no Dropbox metadata
 * traffic at all.
 */
import type { D1Database } from "@cloudflare/workers-types";
import type { ImageDimensions } from "./types";
import { getDb } from "../db";

/** The identity of a file's content — what a measurement is keyed by. */
export interface FileVersion {
  id: string;
  version: string;
}

/** A measurement ready to be stored. */
export interface MeasuredImage extends FileVersion, ImageDimensions {}

export interface DimensionCache {
  /** Dimensions already known for these exact file versions, keyed by file id. */
  read(files: FileVersion[]): Promise<Map<string, ImageDimensions>>;
  /** Remember these measurements. Storing is best-effort — never fail a render for it. */
  write(images: MeasuredImage[]): Promise<void>;
}

interface DimensionRow {
  file_id: string;
  version: string;
  width: number;
  height: number;
}

/**
 * File ids per SELECT. D1 caps a statement at 100 bound parameters, and a gallery can
 * hold more photos than that, so reads are split into batched chunks — `batch()` still
 * costs a single subrequest against D1.
 */
const READ_CHUNK = 90;

class D1DimensionCache implements DimensionCache {
  #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async read(files: FileVersion[]): Promise<Map<string, ImageDimensions>> {
    const known = new Map<string, ImageDimensions>();
    if (files.length === 0) return known;

    // The version a file is *currently* on. A stored row for any other version was
    // measured from bytes that have since been replaced, so it is quietly ignored
    // and the photo gets re-measured.
    const current = new Map(files.map((f) => [f.id, f.version]));
    const ids = [...current.keys()];

    const statements = [];
    for (let i = 0; i < ids.length; i += READ_CHUNK) {
      const chunk = ids.slice(i, i + READ_CHUNK);
      const holes = chunk.map(() => "?").join(", ");
      statements.push(
        this.#db
          .prepare(
            `SELECT file_id, version, width, height FROM image_dimensions
              WHERE file_id IN (${holes})`,
          )
          .bind(...chunk),
      );
    }

    const pages = await this.#db.batch<DimensionRow>(statements);
    for (const page of pages) {
      for (const row of page.results) {
        if (current.get(row.file_id) !== row.version) continue;
        known.set(row.file_id, { width: row.width, height: row.height });
      }
    }
    return known;
  }

  async write(images: MeasuredImage[]): Promise<void> {
    if (images.length === 0) return;
    const now = Date.now();
    // OR IGNORE: a concurrent render may have measured the same version already, and
    // its answer is necessarily identical to ours.
    const insert = this.#db.prepare(
      `INSERT OR IGNORE INTO image_dimensions (file_id, version, width, height, measured_at)
        VALUES (?, ?, ?, ?, ?)`,
    );
    await this.#db.batch(
      images.map((img) => insert.bind(img.id, img.version, img.width, img.height, now)),
    );
  }
}

/** Remembers nothing — for tests, and for any caller with no D1 binding to hand. */
export const noDimensionCache: DimensionCache = {
  async read() {
    return new Map();
  },
  async write() {},
};

export function getDimensionCache(platform: App.Platform | undefined): DimensionCache {
  return new D1DimensionCache(getDb(platform));
}
