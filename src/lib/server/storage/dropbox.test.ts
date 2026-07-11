import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("$app/env/private", () => ({
  DROPBOX_APP_KEY: "app-key",
  DROPBOX_APP_SECRET: "app-secret",
  DROPBOX_REFRESH_TOKEN: "refresh-token",
}));

const tokenResponse = () =>
  new Response(JSON.stringify({ access_token: "t", expires_in: 14_400 }), { status: 200 });

/** What Dropbox sends when it throttles us; `retryAfter` is in seconds. */
const throttled = (retryAfter?: string) =>
  new Response('{"error_summary":"too_many_requests/..."}', {
    status: 429,
    headers: retryAfter ? { "retry-after": retryAfter } : {},
  });

const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 });

let dropbox: typeof import("./dropbox");
let provider: import("./dropbox").DropboxStorageProvider;
let fetchMock: ReturnType<typeof vi.fn>;

/** Answers the token call, then hands out `responses` in order to every other call. */
function script(...responses: Response[]) {
  let next = 0;
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(String(url).includes("oauth2/token") ? tokenResponse() : responses[next++]),
  );
}

/** Thumbnail calls made, excluding the one-off token refresh. */
const thumbnailCalls = () =>
  fetchMock.mock.calls.filter(([url]) => !String(url).includes("oauth2/token")).length;

beforeEach(async () => {
  // The provider keeps module-level state (cached token, concurrency budget,
  // in-flight thumbnails), so each test needs a fresh copy of the module.
  vi.resetModules();
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  dropbox = await import("./dropbox");
  provider = new dropbox.DropboxStorageProvider();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("getThumbnail when Dropbox throttles", () => {
  it("waits out the throttle and serves the thumbnail", async () => {
    script(throttled("1"), jpeg());

    const pending = provider.getThumbnail("/a.jpg", "grid");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({ contentType: "image/jpeg" });
    expect(thumbnailCalls()).toBe(2);
  });

  it("gives up after repeated throttling, reporting how long to wait", async () => {
    script(throttled("2"), throttled("2"), throttled("2"));

    const failure = provider.getThumbnail("/a.jpg", "grid").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await failure;

    expect(error).toBeInstanceOf(dropbox.DropboxApiError);
    expect((error as InstanceType<typeof dropbox.DropboxApiError>).isRateLimited).toBe(true);
    expect((error as InstanceType<typeof dropbox.DropboxApiError>).retryAfterSeconds).toBe(2);
    // Three attempts, not an unbounded retry loop.
    expect(thumbnailCalls()).toBe(3);
  });

  it("fails fast rather than holding the request open for a long Retry-After", async () => {
    script(throttled("300"));

    const failure = provider.getThumbnail("/a.jpg", "grid").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await failure;

    expect((error as InstanceType<typeof dropbox.DropboxApiError>).retryAfterSeconds).toBe(300);
    // No second attempt: five minutes is the client's wait to take, not ours.
    expect(thumbnailCalls()).toBe(1);
  });

  it("backs off on its own when Dropbox sends no Retry-After", async () => {
    script(throttled(), jpeg());

    const pending = provider.getThumbnail("/a.jpg", "grid");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({ contentType: "image/jpeg" });
    expect(thumbnailCalls()).toBe(2);
  });
});

describe("getThumbnail", () => {
  it("does not retry a missing file", async () => {
    script(new Response('{"error_summary":"path/not_found/..."}', { status: 409 }));

    const failure = provider.getThumbnail("/gone.jpg", "grid").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await failure;

    expect((error as InstanceType<typeof dropbox.DropboxApiError>).isNotFound).toBe(true);
    expect(thumbnailCalls()).toBe(1);
  });

  it("serves concurrent requests independently, sharing no promise between them", async () => {
    // Workers give each request its own I/O context: a promise awaiting another
    // request's fetch never resolves once that request ends, and the runtime
    // kills the Worker as hung. So concurrent callers must not be folded onto a
    // shared in-flight call, however tempting the saved Dropbox call looks.
    script(jpeg(), jpeg());

    const both = await Promise.all([
      provider.getThumbnail("/a.jpg", "grid"),
      provider.getThumbnail("/a.jpg", "grid"),
    ]);

    expect(both[0]).not.toBe(both[1]);
    expect(thumbnailCalls()).toBe(2);
  });
});
