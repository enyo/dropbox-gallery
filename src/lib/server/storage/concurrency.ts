/**
 * Primitives for staying inside a rate-limited upstream's budget. Storage
 * backends fan out (one call per thumbnail, one per image's dimensions), and a
 * cold gallery turns a single page view into a burst; these keep that burst from
 * becoming the throttling we then have to recover from.
 */

/** Runs at most `max` calls at once, queueing the rest in arrival order. */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active < max) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await fn();
    } finally {
      // Hand the slot straight to the next waiter instead of releasing it: a
      // caller arriving in the gap between release and wake-up would otherwise
      // take it too, and we would run `max + 1` calls at once.
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/** Folds concurrent calls for the same key onto one in-flight promise. */
export function createCoalescer<T>() {
  const inFlight = new Map<string, Promise<T>>();

  return function coalesce(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const call = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, call);
    return call;
  };
}
