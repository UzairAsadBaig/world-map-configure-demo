import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { RadarFrameManager, type FrameManagerState } from "@/lib/map/radar-frame-manager";
import { RequestBudget } from "@/lib/net/request-budget";
import type { RadarFrame } from "@/lib/radar/types";
import { makeFrames } from "./fixtures";

/**
 * Minimal stand-in for the parts of maplibre-gl's Map the manager uses.
 * `finishLoading(sourceId)` simulates all tiles for the viewport arriving.
 */
class FakeMap {
  sources = new Map<string, { tiles: string[] }>();
  layers = new Map<string, { paint: Record<string, unknown>; layout: Record<string, unknown> }>();
  loaded = new Set<string>();
  removedSources: string[] = [];
  private handlers = new Map<string, Set<(e: unknown) => void>>();

  on(type: string, fn: (e: unknown) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  off(type: string, fn: (e: unknown) => void) {
    this.handlers.get(type)?.delete(fn);
  }
  fire(type: string, e: unknown) {
    this.handlers.get(type)?.forEach((fn) => fn(e));
  }
  addSource(id: string, spec: { tiles: string[] }) {
    this.sources.set(id, spec);
  }
  removeSource(id: string) {
    this.sources.delete(id);
    this.removedSources.push(id);
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  addLayer(spec: { id: string; paint: Record<string, unknown>; layout: Record<string, unknown> }) {
    this.layers.set(spec.id, { paint: { ...spec.paint }, layout: { ...spec.layout } });
  }
  removeLayer(id: string) {
    this.layers.delete(id);
  }
  getLayer(id: string) {
    return this.layers.get(id);
  }
  setPaintProperty(id: string, k: string, v: unknown) {
    this.layers.get(id)!.paint[k] = v;
  }
  setLayoutProperty(id: string, k: string, v: unknown) {
    this.layers.get(id)!.layout[k] = v;
  }
  isSourceLoaded(id: string) {
    return this.loaded.has(id);
  }
  getContainer() {
    return { clientWidth: 1000, clientHeight: 600 };
  }
  getZoom() {
    return 4;
  }
  sourceIdFor(frame: RadarFrame) {
    for (const [id, s] of this.sources) if (s.tiles[0] === frame.tileUrl) return id;
    return undefined;
  }
  finishLoading(frame: RadarFrame) {
    const id = this.sourceIdFor(frame);
    if (!id) throw new Error(`no source for ${frame.key}`);
    this.loaded.add(id);
    this.fire("sourcedata", { sourceId: id, isSourceLoaded: true });
  }
  visibleOpacityFrames(): string[] {
    const out: string[] = [];
    for (const [id, l] of this.layers) if ((l.paint["raster-opacity"] as number) > 0) out.push(this.sources.get(id)!.tiles[0]);
    return out;
  }
}

function setup(budgetLimit = 1000) {
  const map = new FakeMap();
  const budget = new RequestBudget(budgetLimit);
  const displayed: (RadarFrame | null)[] = [];
  const states: FrameManagerState[] = [];
  const mgr = new RadarFrameManager(map as unknown as MapLibreMap, {
    beforeId: undefined,
    tileSize: 512,
    maxzoom: 7,
    budget,
    attribution: "test",
    maxSources: 3,
    onDisplayed: (f) => displayed.push(f),
    onState: (s) => states.push(s),
    onTileErrors: () => {},
  });
  return { map, budget, mgr, displayed, states };
}

describe("RadarFrameManager", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps the previous frame visible until the new one has loaded", () => {
    const { map, mgr, displayed, states } = setup();
    const [a, b] = makeFrames(2);
    mgr.show(a);
    map.finishLoading(a);
    expect(displayed.at(-1)?.key).toBe(a.key);

    mgr.show(b);
    expect(states.at(-1)).toBe("buffering");
    expect(map.visibleOpacityFrames()).toEqual([a.tileUrl]); // still showing a
    map.finishLoading(b);
    expect(displayed.at(-1)?.key).toBe(b.key);
    expect(map.visibleOpacityFrames()).toEqual([b.tileUrl]);
  });

  it("never displays an obsolete frame after rapid scrubbing", () => {
    const { map, mgr, displayed } = setup();
    const f = makeFrames(6);
    mgr.show(f[0]);
    map.finishLoading(f[0]);
    // User drags quickly across several frames.
    mgr.show(f[1]);
    mgr.show(f[2]);
    mgr.show(f[3]);
    // Intermediate frames finish loading late, after the user moved on.
    if (map.sourceIdFor(f[2])) map.finishLoading(f[2]);
    expect(displayed.at(-1)?.key).toBe(f[0].key);
    map.finishLoading(f[3]);
    expect(displayed.at(-1)?.key).toBe(f[3].key);
    expect(displayed.map((d) => d?.key)).not.toContain(f[2].key);
  });

  it("bounds the source cache and removes (cancels) evicted sources", () => {
    const { map, mgr } = setup();
    const f = makeFrames(6);
    for (const frame of f) mgr.show(frame);
    expect(map.sources.size).toBeLessThanOrEqual(3);
    expect(map.removedSources.length).toBeGreaterThanOrEqual(3);
    // The current target is never evicted.
    expect(map.sourceIdFor(f[5])).toBeDefined();
  });

  it("cancelObsolete keeps only the displayed and target frames", () => {
    const { map, mgr } = setup();
    const f = makeFrames(4);
    mgr.show(f[0]);
    map.finishLoading(f[0]);
    mgr.preload(f[1]);
    mgr.show(f[2]);
    expect(map.sources.size).toBe(3);
    mgr.cancelObsolete();
    expect(map.sources.size).toBe(2);
    expect(map.sourceIdFor(f[1])).toBeUndefined();
  });

  it("waits for request budget instead of starting a frame it cannot afford", () => {
    const { map, mgr, budget, states, displayed } = setup(10);
    for (let i = 0; i < 10; i++) budget.record(`u${i}`);
    const [a] = makeFrames(1);
    mgr.show(a);
    expect(states.at(-1)).toBe("rate-limited");
    expect(map.sources.size).toBe(0);
    vi.advanceTimersByTime(61_000); // window slides; retry fires
    expect(map.sources.size).toBe(1);
    map.finishLoading(a);
    expect(displayed.at(-1)?.key).toBe(a.key);
  });

  it("skips preloading when more than half the budget is used", () => {
    const { map, mgr, budget } = setup(20);
    for (let i = 0; i < 11; i++) budget.record(`u${i}`);
    mgr.preload(makeFrames(1)[0]);
    expect(map.sources.size).toBe(0);
  });

  it("completes a frame whose last outstanding tile errored, and reports the errors", () => {
    const { map, mgr, displayed } = setup();
    const errors: number[] = [];
    // Re-wire onTileErrors through a fresh manager to capture counts.
    mgr.destroy();
    const m2 = new RadarFrameManager(map as unknown as MapLibreMap, {
      beforeId: undefined, tileSize: 512, maxzoom: 7, budget: new RequestBudget(1000), attribution: "t",
      onDisplayed: (f) => displayed.push(f), onState: () => {}, onTileErrors: (n) => errors.push(n),
    });
    const [a] = makeFrames(1);
    m2.show(a);
    const id = map.sourceIdFor(a)!;
    map.loaded.add(id); // MapLibre counts errored tiles as "loaded"…
    map.fire("error", { sourceId: id, error: { status: 500, message: "boom" } }); // …but sends no sourcedata after
    expect(displayed.at(-1)?.key).toBe(a.key);
    expect(errors.at(-1)).toBe(1);
  });

  it("enters provider backoff on HTTP 429 tile errors", () => {
    const { map, mgr, budget, states } = setup();
    const [a] = makeFrames(1);
    mgr.show(a);
    map.fire("error", { sourceId: map.sourceIdFor(a), error: { status: 429, message: "Too Many Requests" } });
    expect(states.at(-1)).toBe("rate-limited");
    expect(budget.inCooldown()).toBe(true);
  });

  it("loads nothing while hidden and resumes the remembered target", () => {
    const { map, mgr, displayed } = setup();
    const [a] = makeFrames(1);
    mgr.setVisible(false);
    mgr.show(a);
    expect(map.sources.size).toBe(0);
    mgr.setVisible(true);
    map.finishLoading(a);
    expect(displayed.at(-1)?.key).toBe(a.key);
  });

  it("removes every source and listener on destroy", () => {
    const { map, mgr } = setup();
    mgr.show(makeFrames(1)[0]);
    mgr.destroy();
    expect(map.sources.size).toBe(0);
    expect(map.layers.size).toBe(0);
    mgr.show(makeFrames(1)[0]); // no-op after destroy
    expect(map.sources.size).toBe(0);
  });
});
