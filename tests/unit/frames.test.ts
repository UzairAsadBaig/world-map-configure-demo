import { describe, expect, it } from "vitest";
import {
  clampIndex,
  formatUtcDateTime,
  frameDwellMs,
  nextIndex,
  prevIndex,
  reconcileSelection,
  sortFrames,
} from "@/lib/radar/frames";
import { makeFrames } from "./fixtures";

describe("sortFrames", () => {
  it("orders chronologically and drops duplicate keys", () => {
    const [a, b, c] = makeFrames(3);
    expect(sortFrames([c, a, b, a]).map((f) => f.key)).toEqual([a.key, b.key, c.key]);
  });
});

describe("frame stepping", () => {
  it("wraps forward after the last frame and backward before the first", () => {
    expect(nextIndex(0, 13)).toBe(1);
    expect(nextIndex(12, 13)).toBe(0);
    expect(prevIndex(0, 13)).toBe(12);
    expect(prevIndex(5, 13)).toBe(4);
  });

  it("recovers from an unknown index", () => {
    expect(nextIndex(-1, 13)).toBe(0);
    expect(prevIndex(-1, 13)).toBe(12);
    expect(nextIndex(0, 0)).toBe(-1);
  });

  it("clamps slider values into range", () => {
    expect(clampIndex(-3, 13)).toBe(0);
    expect(clampIndex(99, 13)).toBe(12);
    expect(clampIndex(4.6, 13)).toBe(5);
  });

  it("holds the latest frame longer before looping", () => {
    expect(frameDwellMs(12, 13, "normal")).toBeGreaterThan(frameDwellMs(3, 13, "normal"));
    expect(frameDwellMs(3, 13, "fast")).toBeLessThan(frameDwellMs(3, 13, "slow"));
  });
});

describe("reconcileSelection (refresh handling)", () => {
  const old = makeFrames(13);
  // The provider's window slides by one frame: oldest drops, a new one arrives.
  const refreshed = makeFrames(13, old[1].time);

  it("advances when following the latest frame", () => {
    const r = reconcileSelection(refreshed, { followLatest: true, key: old[12].key }, old);
    expect(r.selection).toEqual({ followLatest: true, key: refreshed[12].key });
    expect(r.notice).toBeNull();
  });

  it("keeps a pinned historical frame that still exists", () => {
    const r = reconcileSelection(refreshed, { followLatest: false, key: old[5].key }, old);
    expect(r.selection.key).toBe(old[5].key);
    expect(r.selection.followLatest).toBe(false);
    expect(r.notice).toBeNull();
  });

  it("replaces an expired frame with the nearest one and explains why", () => {
    const r = reconcileSelection(refreshed, { followLatest: false, key: old[0].key }, old);
    expect(r.selection.key).toBe(refreshed[0].key);
    expect(r.notice).toMatch(/no longer offered/);
    expect(r.notice).toContain("UTC");
  });

  it("selects the latest frame on first load", () => {
    const r = reconcileSelection(old, { followLatest: true, key: null });
    expect(r.selection.key).toBe(old[12].key);
  });

  it("leaves the selection alone when the provider returns no frames", () => {
    const sel = { followLatest: false, key: old[3].key };
    expect(reconcileSelection([], sel, old).selection).toEqual(sel);
  });
});

describe("formatUtcDateTime", () => {
  it("formats in UTC regardless of local time zone", () => {
    expect(formatUtcDateTime(1_793_640_000)).toBe("2026-11-02 17:20 UTC");
  });
});
