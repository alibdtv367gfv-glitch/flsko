type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export function assertRateLimit(userId: number, scope: string, limit: number) {
  clearRateLimitBuckets();
  const now = Date.now();
  const key = `${userId}:${scope}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new Error(`تم الوصول إلى الحد المؤقت للطلبات. حاول بعد ${retryAfter} ثانية.`);
  }
  current.count += 1;
}

export function clearRateLimitBuckets() {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
}
