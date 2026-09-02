const buckets = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 6;
const MAX_BUCKETS = 10_000;

function pruneBuckets(now) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.startedAt > WINDOW_MS) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
}

export function checkRateLimit(key) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.startedAt > WINDOW_MS) {
    if (buckets.size >= MAX_BUCKETS) pruneBuckets(now);
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((WINDOW_MS - (now - current.startedAt)) / 1000) };
  }

  return { allowed: true, remaining: MAX_REQUESTS - current.count, retryAfter: 0 };
}

export function resetRateLimitForTests() {
  buckets.clear();
}
