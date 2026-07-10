/**
 * D1-backed persistence for galleries. A gallery row's primary key is the
 * Gallery Link capability itself: an unguessable random id that appears in the
 * URL as `/g/<id>`. Persisting galleries (instead of encoding them into signed
 * tokens) is what makes per-link revocation and an admin listing possible.
 * See ADR-0003.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { GalleryRef } from './types';
import { getDb } from '../db';

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
}

/** Outcome of resolving a `/g/<id>` capability, distinguishing why access failed. */
export type GalleryLookup =
	| { status: 'ok'; ref: GalleryRef }
	| { status: 'expired' }
	| { status: 'revoked' }
	| { status: 'not-found' };

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
		coverExcluded: row.cover_excluded === 1
	};
}

/**
 * Decide whether a looked-up row grants access. Pure and time-injectable so the
 * expiry/revocation rules can be unit-tested without a live database.
 */
export function resolveRow(row: GalleryRow | null, now: number): GalleryLookup {
	if (!row) return { status: 'not-found' };
	if (row.revoked_at !== null) return { status: 'revoked' };
	if (row.expires_at !== null && now > row.expires_at) return { status: 'expired' };
	return {
		status: 'ok',
		ref: {
			id: row.folder_id,
			shareUrl: row.share_url,
			title: row.title,
			coverImage: row.cover_image,
			coverExcluded: row.cover_excluded === 1
		}
	};
}

/** Generate a 128-bit unguessable capability id, URL-safe (22 base64url chars). */
export function newGalleryId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Buffer.from(bytes).toString('base64url');
}

export class GalleryStore {
	#db: D1Database;

	constructor(db: D1Database) {
		this.#db = db;
	}

	/** Persist a new gallery and return its capability id (the `/g/<id>` value). */
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
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(id, input.folderId, input.shareUrl, input.title, Date.now(), input.expiresAt)
			.run();
		return id;
	}

	/** Resolve a capability id to a gallery reference, or the reason it's unavailable. */
	async resolve(id: string, now = Date.now()): Promise<GalleryLookup> {
		const row = await this.#db
			.prepare(`SELECT * FROM galleries WHERE id = ?`)
			.bind(id)
			.first<GalleryRow>();
		return resolveRow(row, now);
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

	/** Update a gallery's editable fields (title and expiry). Returns true if the row exists. */
	async update(id: string, fields: { title: string; expiresAt: number | null }): Promise<boolean> {
		const { meta } = await this.#db
			.prepare(`UPDATE galleries SET title = ?, expires_at = ? WHERE id = ?`)
			.bind(fields.title, fields.expiresAt, id)
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
	 * Permanently delete a gallery row. The capability id becomes unresolvable
	 * (a 404, not a 410 like revocation). Returns true if a row was removed.
	 */
	async delete(id: string): Promise<boolean> {
		const { meta } = await this.#db.prepare(`DELETE FROM galleries WHERE id = ?`).bind(id).run();
		return meta.changes > 0;
	}
}

/** The gallery store for the current request (see `getDb` for how the binding is resolved). */
export function getGalleryStore(platform: App.Platform | undefined): GalleryStore {
	return new GalleryStore(getDb(platform));
}
