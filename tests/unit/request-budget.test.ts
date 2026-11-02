import { describe, expect, it } from "vitest";
import { HttpError, RequestBudget, isRateLimitedUrl, retryDelayMs } from "@/lib/net/request-budget";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("RequestBudget", () => {
  it("counts each URL once and enforces the window limit", () => {
    const c = clock();
    const b = new RequestBudget(3, 60_000, c.now);
    expect(b.record("a")).toBe(true);
    expect(b.record("a")).toBe(false); // repeat = expected HTTP cache hit
    b.record("b");
    b.record("c");
    expect(b.used()).toBe(3);
    expect(b.canSpend(1)).toBe(false);
  });

  it("frees budget as the window slides", () => {
    const c = clock();
    const b = new RequestBudget(2, 60_000, c.now);
    b.record("a");
    c.advance(30_000);
    b.record("b");
    expect(b.msUntilAvailable(1)).toBe(30_000);
    c.advance(30_001);
    expect(b.remaining()).toBe(1);
  });

  it("backs off exponentially after HTTP 429", () => {
    const c = clock(1_000_000);
    const b = new RequestBudget(50, 60_000, c.now);
    expect(b.penalize()).toBe(15_000);
    expect(b.remaining()).toBe(0);
    expect(b.penalize()).toBe(30_000);
    expect(b.penalize()).toBe(60_000);
    expect(b.penalize()).toBe(120_000);
    expect(b.penalize()).toBe(120_000); // capped
    c.advance(120_001 + 60_001);
    expect(b.inCooldown()).toBe(false);
    expect(b.penalize()).toBe(15_000); // reset after a quiet period
  });

  it("matches rate-limited hosts only", () => {
    const hosts = ["tilecache.rainviewer.com"];
    expect(isRateLimitedUrl("https://tilecache.rainviewer.com/v2/x.png", hosts)).toBe(true);
    expect(isRateLimitedUrl("https://tiles.openfreemap.org/planet", hosts)).toBe(false);
    expect(isRateLimitedUrl("not a url", hosts)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("waits much longer after a rate limit than after a generic failure", () => {
    const mid = () => 0.5;
    expect(retryDelayMs(0, new Error("x"), mid)).toBe(1_000);
    expect(retryDelayMs(0, new HttpError(429, "slow down"), mid)).toBe(15_000);
    expect(retryDelayMs(10, new Error("x"), mid)).toBe(30_000);
  });
});
