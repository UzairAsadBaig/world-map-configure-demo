import type { Map as MapLibreMap, MapSourceDataEvent } from "maplibre-gl";
import type { RadarFrame } from "@/lib/radar/types";
import type { RequestBudget } from "@/lib/net/request-budget";
import { estimateTilesForView } from "./tiles";

/**
 * Owns one MapLibre raster source + layer per radar frame and decides which of
 * them is drawn.
 *
 * Why one source per frame: swapping the `tiles` URL of a single source would
 * blank the map while the new tiles load. With a source per frame, the last
 * complete frame stays visible (opacity > 0) while its replacement loads at
 * opacity 0, and the swap happens only once the replacement has no
 * outstanding tile requests for the current viewport.
 *
 * The cache is bounded (`maxSources`). Removing a source makes MapLibre abort
 * its in-flight tile requests, which is how obsolete work (rapid scrubbing,
 * region changes) is cancelled.
 */

export type FrameManagerState = "idle" | "loading" | "buffering" | "ready" | "rate-limited" | "hidden";

export interface FrameManagerOptions {
  /** Layer id the radar layers are inserted beneath (first basemap label layer). */
  beforeId: string | undefined;
  tileSize: number;
  maxzoom: number;
  budget: RequestBudget;
  attribution: string;
  maxSources?: number;
  onDisplayed(frame: RadarFrame | null): void;
  onState(state: FrameManagerState): void;
  onTileErrors(count: number): void;
}

interface Entry {
  frame: RadarFrame;
  sourceId: string;
  layerId: string;
  lastUsed: number;
  errors: number;
  loaded: boolean;
}

const PREFIX = "radar-frame-";

export class RadarFrameManager {
  private entries = new Map<string, Entry>();
  private displayed: Entry | null = null;
  private target: RadarFrame | null = null;
  private opacity = 0.8;
  private visible = true;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private destroyed = false;
  private readonly maxSources: number;

  constructor(
    private readonly map: MapLibreMap,
    private readonly opts: FrameManagerOptions,
  ) {
    this.maxSources = opts.maxSources ?? 4;
    map.on("sourcedata", this.handleSourceData);
    map.on("error", this.handleError);
    map.on("moveend", this.handleMoveEnd);
  }

  /** Request that `frame` be drawn. The previous frame stays until it is ready. */
  show(frame: RadarFrame | null) {
    if (this.destroyed) return;
    this.target = frame;
    this.clearRetry();
    if (!frame) return;
    if (!this.visible) {
      // Nothing is loaded while hidden (saves request budget). The target is
      // remembered and loaded when the layer is switched back on.
      this.opts.onState("hidden");
      return;
    }
    const existing = this.entries.get(frame.key);
    if (existing) {
      existing.lastUsed = ++this.seq;
      this.checkReady(existing);
      return;
    }
    if (!this.reserveBudget()) return;
    const entry = this.addEntry(frame);
    this.opts.onState(this.displayed ? "buffering" : "loading");
    this.evict();
    this.checkReady(entry);
  }

  /**
   * Conservatively warm the cache with one upcoming frame. Skipped when the
   * request budget is more than half used, so user-driven loads keep priority.
   */
  preload(frame: RadarFrame | null) {
    if (this.destroyed || !frame || !this.visible) return;
    if (this.entries.has(frame.key)) return;
    if (this.opts.budget.fraction() > 0.5) return;
    if (!this.opts.budget.canSpend(this.estimateTiles() * 2)) return;
    this.addEntry(frame);
    this.evict();
  }

  /** Drop the provider's current frame list; sources for vanished frames go (except the one on screen). */
  setFrames(frames: readonly RadarFrame[]) {
    const keys = new Set(frames.map((f) => f.key));
    for (const entry of [...this.entries.values()]) {
      if (!keys.has(entry.frame.key) && entry !== this.displayed) this.removeEntry(entry);
    }
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
    if (this.displayed) this.paint(this.displayed, opacity);
  }

  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;
    for (const e of this.entries.values()) {
      this.map.setLayoutProperty(e.layerId, "visibility", visible ? "visible" : "none");
    }
    if (visible) {
      this.opts.onState(this.displayed ? "ready" : "loading");
      this.show(this.target);
    } else {
      this.clearRetry();
      this.opts.onState("hidden");
    }
  }

  /**
   * Cancel work that no longer matters, e.g. after a region jump: every
   * source that is neither on screen nor the current target is removed,
   * aborting its tile requests.
   */
  cancelObsolete() {
    for (const entry of [...this.entries.values()]) {
      if (entry !== this.displayed && entry.frame.key !== this.target?.key) this.removeEntry(entry);
    }
  }

  destroy() {
    this.destroyed = true;
    this.clearRetry();
    this.map.off("sourcedata", this.handleSourceData);
    this.map.off("error", this.handleError);
    this.map.off("moveend", this.handleMoveEnd);
    // The map may already be removed during teardown; guard each call.
    for (const entry of [...this.entries.values()]) {
      try {
        this.removeEntry(entry);
      } catch {
        /* map already gone */
      }
    }
    this.entries.clear();
  }

  private estimateTiles(): number {
    const c = this.map.getContainer();
    return estimateTilesForView(
      c.clientWidth,
      c.clientHeight,
      this.map.getZoom(),
      this.opts.tileSize,
      this.opts.maxzoom,
    );
  }

  /** Returns false (and schedules a retry) when the budget cannot cover a new frame. */
  private reserveBudget(): boolean {
    const needed = this.estimateTiles();
    const budget = this.opts.budget;
    if (budget.canSpend(needed)) return true;
    this.opts.onState("rate-limited");
    const wait = Math.max(1000, Math.min(budget.msUntilAvailable(needed), 60_000));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.show(this.target);
    }, wait);
    return false;
  }

  private addEntry(frame: RadarFrame): Entry {
    const id = `${PREFIX}${this.seq + 1}`;
    const entry: Entry = {
      frame,
      sourceId: id,
      layerId: id,
      lastUsed: ++this.seq,
      errors: 0,
      loaded: false,
    };
    this.map.addSource(entry.sourceId, {
      type: "raster",
      tiles: [frame.tileUrl],
      tileSize: this.opts.tileSize,
      maxzoom: this.opts.maxzoom,
      attribution: this.opts.attribution,
    });
    this.map.addLayer(
      {
        id: entry.layerId,
        type: "raster",
        source: entry.sourceId,
        layout: { visibility: this.visible ? "visible" : "none" },
        paint: {
          // Loaded at opacity 0: MapLibre still fetches tiles for layers that
          // are "visible" in layout terms, but nothing is drawn yet.
          "raster-opacity": 0,
          "raster-opacity-transition": { duration: 0, delay: 0 },
          // Cross-fading tiles would blend two timesteps; keep frames crisp.
          "raster-fade-duration": 0,
          "raster-resampling": "linear",
        },
      },
      this.opts.beforeId,
    );
    this.entries.set(frame.key, entry);
    return entry;
  }

  private removeEntry(entry: Entry) {
    if (this.map.getLayer(entry.layerId)) this.map.removeLayer(entry.layerId);
    if (this.map.getSource(entry.sourceId)) this.map.removeSource(entry.sourceId);
    this.entries.delete(entry.frame.key);
    if (this.displayed === entry) this.displayed = null;
  }

  /** LRU eviction that never drops the displayed frame or the current target. */
  private evict() {
    const removable = [...this.entries.values()]
      .filter((e) => e !== this.displayed && e.frame.key !== this.target?.key)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    while (this.entries.size > this.maxSources && removable.length) {
      this.removeEntry(removable.shift()!);
    }
  }

  private paint(entry: Entry, opacity: number) {
    if (this.map.getLayer(entry.layerId)) {
      this.map.setPaintProperty(entry.layerId, "raster-opacity", opacity);
    }
  }

  private checkReady(entry: Entry) {
    // Only the *current* target may be swapped in. A frame that finishes
    // loading after the user scrubbed past it is kept in cache but never shown,
    // so rapid scrubbing cannot display an obsolete frame.
    if (entry.frame.key !== this.target?.key) return;
    if (!this.map.getSource(entry.sourceId)) return;
    if (!this.map.isSourceLoaded(entry.sourceId)) return;
    entry.loaded = true;
    if (this.displayed !== entry) {
      // Draw the new frame first, then hide the old one, in the same JS task,
      // so MapLibre never renders a frame without radar.
      this.paint(entry, this.opacity);
      if (this.displayed) this.paint(this.displayed, 0);
      this.displayed = entry;
      this.opts.onDisplayed(entry.frame);
    }
    this.opts.onTileErrors(entry.errors);
    this.opts.onState("ready");
  }

  private handleSourceData = (e: MapSourceDataEvent) => {
    if (!e.sourceId?.startsWith(PREFIX)) return;
    const entry = [...this.entries.values()].find((x) => x.sourceId === e.sourceId);
    if (entry) this.checkReady(entry);
  };

  private handleMoveEnd = () => {
    // After panning/zooming, the displayed frame has new tiles to fetch.
    // Re-check the target so a pending swap completes once its tiles are in.
    const entry = this.target ? this.entries.get(this.target.key) : undefined;
    if (entry) this.checkReady(entry);
  };

  private handleError = (e: { error?: unknown; sourceId?: string }) => {
    const sourceId = e.sourceId;
    if (!sourceId?.startsWith(PREFIX)) return;
    const status = (e.error as { status?: number } | undefined)?.status;
    if (status === 429) {
      this.opts.budget.penalize();
      this.opts.onState("rate-limited");
      return;
    }
    const entry = [...this.entries.values()].find((x) => x.sourceId === sourceId);
    if (!entry) return;
    entry.errors += 1;
    if (entry === this.displayed) this.opts.onTileErrors(entry.errors);
    // MapLibre marks the tile "errored" and fires no further sourcedata event,
    // so if this was the last outstanding tile the frame is now complete
    // (with gaps). Re-check, otherwise it would wait forever.
    this.checkReady(entry);
  };

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
