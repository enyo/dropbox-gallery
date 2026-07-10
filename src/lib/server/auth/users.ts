/**
 * D1-backed admin users. Authentication looks a user up by username and checks
 * the supplied password against the stored salted hash (see `password.ts`).
 * Credentials are seeded/rotated out of band with the `admin:create` script,
 * never through a public route. See ADR-0006.
 */
import type { D1Database } from "@cloudflare/workers-types";
import { getDb } from "../db";

export interface AdminUser {
  username: string;
  /** Self-describing PBKDF2 hash string (see `password.ts`). */
  passwordHash: string;
  createdAt: number;
}

interface UserRow {
  username: string;
  password_hash: string;
  created_at: number;
}

export class UserStore {
  #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async findByUsername(username: string): Promise<AdminUser | null> {
    const row = await this.#db
      .prepare(`SELECT * FROM users WHERE username = ?`)
      .bind(username)
      .first<UserRow>();
    if (!row) return null;
    return { username: row.username, passwordHash: row.password_hash, createdAt: row.created_at };
  }

  /** Create the user, or update the password of an existing one. */
  async upsert(username: string, passwordHash: string, now = Date.now()): Promise<void> {
    await this.#db
      .prepare(
        `INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)
				 ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`,
      )
      .bind(username, passwordHash, now)
      .run();
  }
}

export function getUserStore(platform: App.Platform | undefined): UserStore {
  return new UserStore(getDb(platform));
}
