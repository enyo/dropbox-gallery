import { ImageNotFoundError } from "./gallery/types";
import { DropboxApiError } from "./storage/dropbox";

/**
 * The response for a thumbnail that could not be fetched, or null when the
 * failure is not one we recognise (the caller should rethrow and 500).
 *
 * Shared by the viewer and admin thumb routes because the throttling case has a
 * policy attached that is easy to get wrong in one of the two: a throttled
 * upstream must be served `no-store`, or a transient 429 sticks to the edge for
 * as long as the entry lives, and it must stay *retryable* — an <img> that
 * fails never retries itself, so a hard error would leave a permanently broken
 * tile until the visitor reloads.
 */
export function thumbErrorResponse(e: unknown): Response | null {
  if (e instanceof ImageNotFoundError || (e instanceof DropboxApiError && e.isNotFound)) {
    return new Response("Not found", { status: 404 });
  }
  if (e instanceof DropboxApiError && e.isRateLimited) {
    return new Response("Upstream busy — retry shortly", {
      status: 503,
      headers: {
        "retry-after": String(e.retryAfterSeconds ?? 2),
        "cache-control": "no-store",
      },
    });
  }
  return null;
}
