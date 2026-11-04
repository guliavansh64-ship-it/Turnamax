const buckets = new Map<string, { count: number; windowStart: number }>();

// Basic in-memory fixed-window limiter. Keys should include ip + route scope.
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

// Occasional sweep to keep memory bounded
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now - b.windowStart > 60 * 60 * 1000) buckets.delete(k);
    }
  }, 10 * 60 * 1000).unref();
}
