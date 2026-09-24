/**
 * Best-effort in-memory rate limiter.
 *
 * This is a public portfolio demo calling a paid API, so an unthrottled
 * endpoint is an open invitation to burn credits. Serverless instances
 * don't share memory, so the real ceiling is (limit x warm instances) --
 * enough to blunt casual abuse. Swap in Vercel KV or Upstash if this ever
 * needs a hard guarantee.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 60 * 60 * 1000,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    retryAfterSeconds: 0,
  };
}

/** Best available client identifier behind Vercel's proxy. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * Global daily budget across all visitors.
 *
 * The per-visitor limit bounds one person; this bounds the bill. Like the
 * limiter above it lives in memory, so each warm instance carries its own
 * counter and the real ceiling is (limit x instances) -- a backstop against
 * a link that gets passed around, not an accounting guarantee.
 */

const DEFAULT_DAILY_LIMIT = 100;

let dailyCount = 0;
let dailyResetAt = 0;

function startOfNextUtcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
}

export function dailyLimit(): number {
  const configured = Number(process.env.DAILY_SCREENING_LIMIT);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_DAILY_LIMIT;
}

export type DailyBudget = { allowed: boolean; used: number; limit: number };

/** Counts one screening against today's budget, or reports it exhausted. */
export function consumeDailyBudget(): DailyBudget {
  const now = Date.now();
  const limit = dailyLimit();

  if (now >= dailyResetAt) {
    dailyCount = 0;
    dailyResetAt = startOfNextUtcDay(now);
  }

  if (dailyCount >= limit) {
    return { allowed: false, used: dailyCount, limit };
  }

  dailyCount += 1;
  return { allowed: true, used: dailyCount, limit };
}

/** Returns an unused screening to the budget when no model call was made. */
export function refundDailyBudget(): void {
  if (dailyCount > 0) dailyCount -= 1;
}
