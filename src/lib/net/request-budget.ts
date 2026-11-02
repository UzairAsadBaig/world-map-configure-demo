/**
 * Client-side accounting for a provider's per-minute request limit.
 *
 * MapLibre owns tile fetching, so we cannot queue its requests directly.
 * Instead every provider URL passes through `record()` (from MapLibre's
 * `transformRequest`, the metadata fetch and the point sampler) and the frame
 * manager / playback consult `remaining()` *before* asking MapLibre to load a
 * new frame. That keeps the decision of "whether to start work" on our side.
 *
 * Only the first request for a URL is counted: provider tiles are served with
 * `Cache-Control: max-age=172800`, so repeats are expected to be browser-cache
 * hits. This is an estimate, deliberately biased towards over-counting new work.
 */
export interface BudgetSnapshot {
  used: number;
  limit: number;
  cooldownUntil: number;
}

type Listener = (snapshot: BudgetSnapshot) => void;

export class RequestBudget {
  private stamps: number[] = [];
  private seen = new Set<string>();
  private cooldownUntil = 0;
  private penaltyMs = 0;
  private listeners = new Set<Listener>();

  constructor(
    /** Requests allowed per window. Set below the provider ceiling to leave headroom. */
    readonly limit: number,
    readonly windowMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Counts a request if this URL has not been requested before. Returns true if counted. */
  record(url: string): boolean {
    if (this.seen.has(url)) return false;
    this.seen.add(url);
    // Bound memory; the HTTP cache window (2 days) far exceeds a session anyway.
    if (this.seen.size > 5000) this.seen.clear();
    this.stamps.push(this.now());
    this.emit();
    return true;
  }

  used(): number {
    this.prune();
    return this.stamps.length;
  }

  remaining(): number {
    if (this.inCooldown()) return 0;
    return Math.max(0, this.limit - this.used());
  }

  /** Fraction of the window budget consumed, 0..1. */
  fraction(): number {
    return Math.min(1, this.used() / this.limit);
  }

  canSpend(n: number): boolean {
    return this.remaining() >= n;
  }

  /** Milliseconds until at least `n` requests are available again (0 if now). */
  msUntilAvailable(n: number): number {
    const t = this.now();
    if (this.inCooldown()) return this.cooldownUntil - t;
    this.prune();
    const excess = this.stamps.length + n - this.limit;
    if (excess <= 0) return 0;
    const idx = Math.min(excess - 1, this.stamps.length - 1);
    return Math.max(0, this.stamps[idx] + this.windowMs - t);
  }

  /**
   * Called when the provider answers 429. Exponential backoff starting at
   * 15 s, capped at 2 minutes; reset after a quiet minute without penalties.
   */
  penalize(): number {
    const t = this.now();
    this.penaltyMs = t < this.cooldownUntil + 60_000 && this.penaltyMs > 0
      ? Math.min(this.penaltyMs * 2, 120_000)
      : 15_000;
    this.cooldownUntil = t + this.penaltyMs;
    this.emit();
    return this.penaltyMs;
  }

  inCooldown(): boolean {
    return this.now() < this.cooldownUntil;
  }

  snapshot(): BudgetSnapshot {
    return { used: this.used(), limit: this.limit, cooldownUntil: this.cooldownUntil };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private prune() {
    const cutoff = this.now() - this.windowMs;
    let i = 0;
    while (i < this.stamps.length && this.stamps[i] <= cutoff) i++;
    if (i > 0) this.stamps.splice(0, i);
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }
}

/**
 * Single shared budget for RainViewer. 85 of the documented 100 requests/min
 * leaves headroom for metadata refreshes and requests we cannot observe.
 */
export const providerBudget = new RequestBudget(85);

export function isRateLimitedUrl(url: string, hosts: readonly string[]): boolean {
  try {
    return hosts.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Retry delay for metadata fetches: exponential with jitter, longer after 429. */
export function retryDelayMs(attempt: number, error: unknown, random = Math.random): number {
  const rateLimited = error instanceof HttpError && error.status === 429;
  const base = rateLimited ? 15_000 : 1_000;
  const cap = rateLimited ? 120_000 : 30_000;
  const exp = Math.min(cap, base * 2 ** attempt);
  return Math.round(exp * (0.75 + random() * 0.5));
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
