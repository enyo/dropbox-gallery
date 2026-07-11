import { DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN } from "$app/env/private";
import type { ThumbSize, ThumbResult, ResolvedFolder, ImageDimensions } from "../gallery/types";
import type { StorageProvider, StoredFile } from "./types";

const RPC = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

const THUMB_SIZE: Record<ThumbSize, string> = { grid: "w640h480", full: "w2048h1536" };

/**
 * Dropbox rate-limits per app-user, tightest on concurrency: a cold gallery asks
 * for every tile in the viewport at once and some of those come back throttled.
 * We cannot throttle *ourselves* across requests — a Worker isolate has no safe
 * shared queue (see the note on the token cache below) — so we absorb 429s here
 * instead of preventing them, and let the caller fail soft if that is not enough.
 *
 * Attempts per call, including the first — so two retries after a 429/5xx.
 */
const MAX_ATTEMPTS = 3;
/**
 * Longest we will hold a visitor's request open waiting out a `Retry-After`.
 * Beyond this, failing fast and letting the client come back beats stalling.
 */
const MAX_RETRY_WAIT_MS = 8_000;

export class DropboxApiError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    readonly detail: string,
    /** On a throttled call, how many seconds Dropbox asked us to wait. */
    readonly retryAfterSeconds?: number,
  ) {
    super(`Dropbox ${endpoint} failed (${status}): ${detail}`);
    this.name = "DropboxApiError";
  }

  /** True when the error is Dropbox reporting a missing path/file. */
  get isNotFound(): boolean {
    return this.detail.includes("not_found");
  }

  /** True when Dropbox throttled us and our retries did not outlast it. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long to wait before re-attempting: what Dropbox asked for, else backoff. */
function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  // Jittered exponential backoff, so a burst of throttled calls does not all
  // come back at the same instant and throttle each other again.
  return 2 ** attempt * 250 + Math.random() * 250;
}

/**
 * One Dropbox call, retried when Dropbox throttles (429) or fails transiently
 * (5xx). A 429 that outlives our attempts surfaces as a `DropboxApiError` with
 * `isRateLimited`, which callers turn into a retryable response rather than a
 * hard failure.
 */
async function call(endpoint: string, url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    // 4xx other than 429 is our bug or a missing file: no point re-asking.
    if (res.status !== 429 && res.status < 500) {
      throw new DropboxApiError(endpoint, res.status, await res.text());
    }

    const delay = retryDelayMs(res, attempt);
    if (attempt + 1 >= MAX_ATTEMPTS || delay > MAX_RETRY_WAIT_MS) {
      throw new DropboxApiError(endpoint, res.status, await res.text(), Math.ceil(delay / 1000));
    }
    await sleep(delay);
  }
}

interface DropboxEntry {
  ".tag": "file" | "folder" | "deleted";
  id: string;
  name: string;
  content_hash?: string;
  rev?: string;
}

interface ListFolderResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

interface SharedLinkMetadata {
  ".tag": "file" | "folder";
  name: string;
  path_lower?: string;
}

interface FileMetadataWithMedia {
  media_info?: {
    ".tag": "pending" | "metadata";
    metadata?: { ".tag": "photo" | "video"; dimensions?: { width: number; height: number } };
  };
}

/**
 * In-memory access token, refreshed from the long-lived refresh token as needed.
 *
 * Only the *value* is shared between requests, never the in-flight refresh. A
 * Worker isolate serves many requests concurrently but gives each its own I/O
 * context, so a promise awaiting another request's `fetch` can never resolve
 * once that request ends — the runtime spots the stall and kills the Worker
 * ("your Worker's code had hung"). Sharing one refresh across a cold isolate's
 * first burst therefore hangs every request but the one that started it. Minting
 * a few redundant tokens is the cheap, correct trade.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (!DROPBOX_REFRESH_TOKEN) {
    throw new Error("Dropbox not configured: set DROPBOX_REFRESH_TOKEN.");
  }
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const res = await fetch(`https://api.dropboxapi.com/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: DROPBOX_REFRESH_TOKEN,
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
    }),
  });
  if (!res.ok) throw new DropboxApiError("oauth2/token", res.status, await res.text());
  const data = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh 5 minutes before actual expiry.
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };
  return cachedToken.value;
}

async function rpc<T>(endpoint: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await call(endpoint, `${RPC}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export class DropboxStorageProvider implements StorageProvider {
  async resolveFolder(shareUrl: string): Promise<ResolvedFolder> {
    const meta = await rpc<SharedLinkMetadata>("sharing/get_shared_link_metadata", {
      url: shareUrl,
    });
    if (meta[".tag"] !== "folder") throw new Error("That link points to a file, not a folder.");
    if (!meta.path_lower) {
      throw new Error(
        "Could not resolve the folder path. Make sure the Dropbox app has Full Dropbox access.",
      );
    }
    return { id: meta.path_lower, shareUrl, name: meta.name };
  }

  async listFiles(folderId: string): Promise<StoredFile[]> {
    let page = await rpc<ListFolderResult>("files/list_folder", { path: folderId });
    const entries: DropboxEntry[] = [...page.entries];
    while (page.has_more) {
      page = await rpc<ListFolderResult>("files/list_folder/continue", { cursor: page.cursor });
      entries.push(...page.entries);
    }
    return entries
      .filter((e) => e[".tag"] === "file")
      .map((e) => ({ id: e.id, name: e.name, version: e.content_hash ?? e.rev ?? e.id }));
  }

  async getThumbnail(fileId: string, size: ThumbSize): Promise<ThumbResult> {
    const token = await getAccessToken();
    const res = await call("get_thumbnail_v2", `${CONTENT}/files/get_thumbnail_v2`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({
          resource: { ".tag": "path", path: fileId },
          format: { ".tag": "jpeg" },
          size: { ".tag": THUMB_SIZE[size] },
          mode: { ".tag": "bestfit" },
        }),
      },
    });
    return { body: new Uint8Array(await res.arrayBuffer()), contentType: "image/jpeg" };
  }

  async getOriginalUrl(fileId: string): Promise<string> {
    const data = await rpc<{ link: string }>("files/get_temporary_link", { path: fileId });
    return data.link;
  }

  async getImageDimensions(fileId: string): Promise<ImageDimensions | null> {
    const data = await rpc<FileMetadataWithMedia>("files/get_metadata", {
      path: fileId,
      include_media_info: true,
    });
    const dims = data.media_info?.metadata?.dimensions;
    return dims ? { width: dims.width, height: dims.height } : null;
  }
}
