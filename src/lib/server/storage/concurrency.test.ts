import { describe, it, expect } from "vitest";
import { createLimiter, createCoalescer } from "./concurrency";

/** A promise plus the handle to settle it, so a test can hold calls open. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createLimiter", () => {
  it("never runs more than `max` calls at once", async () => {
    const limit = createLimiter(2);
    const gates = Array.from({ length: 6 }, () => deferred());
    let active = 0;
    let peak = 0;

    const calls = gates.map((gate) =>
      limit(async () => {
        peak = Math.max(peak, ++active);
        await gate.promise;
        active--;
      }),
    );

    // Release one at a time: each completion may wake at most one waiter.
    for (const gate of gates) {
      gate.resolve();
      await Promise.resolve();
    }
    await Promise.all(calls);

    expect(peak).toBe(2);
  });

  it("frees the slot when a call rejects", async () => {
    const limit = createLimiter(1);

    await expect(limit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(limit(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("runs queued calls in arrival order", async () => {
    const limit = createLimiter(1);
    const gate = deferred();
    const order: number[] = [];

    const calls = [
      limit(async () => {
        await gate.promise;
        order.push(0);
      }),
      limit(async () => void order.push(1)),
      limit(async () => void order.push(2)),
    ];
    gate.resolve();
    await Promise.all(calls);

    expect(order).toEqual([0, 1, 2]);
  });
});

describe("createCoalescer", () => {
  it("shares one in-flight call between callers of the same key", async () => {
    const coalesce = createCoalescer<string>();
    const gate = deferred<string>();
    let calls = 0;

    const fn = () => {
      calls++;
      return gate.promise;
    };
    const both = Promise.all([coalesce("a", fn), coalesce("a", fn)]);
    gate.resolve("thumb");

    expect(await both).toEqual(["thumb", "thumb"]);
    expect(calls).toBe(1);
  });

  it("keeps different keys apart", async () => {
    const coalesce = createCoalescer<string>();
    const calls: string[] = [];

    const results = await Promise.all(
      ["a", "b"].map((key) =>
        coalesce(key, async () => {
          calls.push(key);
          return key;
        }),
      ),
    );

    expect(results).toEqual(["a", "b"]);
    expect(calls).toEqual(["a", "b"]);
  });

  it("does not cache: a settled call is not reused", async () => {
    const coalesce = createCoalescer<number>();
    let calls = 0;
    const fn = async () => ++calls;

    expect(await coalesce("a", fn)).toBe(1);
    expect(await coalesce("a", fn)).toBe(2);
  });

  it("releases the key when the call rejects, so a later caller retries", async () => {
    const coalesce = createCoalescer<string>();

    await expect(coalesce("a", () => Promise.reject(new Error("429")))).rejects.toThrow("429");
    await expect(coalesce("a", () => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});
