import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  indexOfKey,
  nextIndex,
  prevIndex,
  reconcileSelection,
  type FrameSelection,
  type PlaybackSpeedId,
} from "@/lib/radar/frames";
import type { RadarCatalog, RadarFrame } from "@/lib/radar/types";
import { DEFAULT_REGION, type RegionId } from "@/lib/map/regions";
import type { AnnotationProperties } from "@/lib/annotations/sample-annotations";

/**
 * Shared, serialisable UI state only. The MapLibre instance, frame sources,
 * timers and AbortControllers live in MapController / PlaybackController,
 * which subscribe to this store from outside React.
 */

export type FrameLoadState =
  | "idle" // no catalog yet
  | "loading" // first frame for this view is loading
  | "buffering" // a newer frame is requested; the previous one stays on screen
  | "ready"
  | "rate-limited" // waiting for request budget / provider backoff
  | "hidden"; // radar layer switched off; nothing is being loaded

export interface LayerState {
  radar: { visible: boolean; opacity: number };
  coverage: { visible: boolean };
  annotations: { visible: boolean };
}

export interface AtmosState {
  catalog: RadarCatalog | null;
  selection: FrameSelection;
  /**
   * The frame MapLibre is actually drawing. Timestamps in the UI come from this.
   * Stored as an object (not a key) so it stays describable even after a refresh
   * drops it from the catalog while it is still on screen.
   */
  displayedFrame: RadarFrame | null;
  frameLoadState: FrameLoadState;
  /** Tile errors seen for the displayed frame (non-429). */
  tileErrorCount: number;
  notice: string | null;

  isPlaying: boolean;
  speed: PlaybackSpeedId;

  layers: LayerState;
  regionId: RegionId;
  /** Incremented to ask the map to (re)fit a region, e.g. "Reset view". */
  viewRequest: { regionId: RegionId; nonce: number };

  clicked: { lng: number; lat: number; zoom: number } | null;
  selectedFeature: AnnotationProperties | null;

  mapStatus: "loading" | "ready" | "error";
  mapError: string | null;
  basemapError: boolean;
  budget: { used: number; limit: number; cooldownUntil: number };
  mobilePanelOpen: boolean;
  /** Updated on moveend only (not per animation frame). */
  mapZoom: number;
}

export interface AtmosActions {
  setCatalog(catalog: RadarCatalog): void;
  selectFrame(key: string): void;
  /** Used by playback only: advances without pausing. */
  playbackAdvance(): void;
  stepFrame(delta: 1 | -1): void;
  goLatest(): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): void;
  setSpeed(speed: PlaybackSpeedId): void;
  setDisplayed(frame: RadarFrame | null): void;
  setFrameLoadState(state: FrameLoadState): void;
  setTileErrorCount(n: number): void;
  dismissNotice(): void;
  setLayerVisible(layer: keyof LayerState, visible: boolean): void;
  setRadarOpacity(opacity: number): void;
  selectRegion(id: RegionId): void;
  resetView(): void;
  setClicked(c: AtmosState["clicked"]): void;
  setSelectedFeature(f: AnnotationProperties | null): void;
  setMapStatus(status: AtmosState["mapStatus"], error?: string | null): void;
  setBasemapError(v: boolean): void;
  setBudget(b: AtmosState["budget"]): void;
  setMobilePanelOpen(open: boolean): void;
  setMapZoom(zoom: number): void;
}

export const initialAtmosState: AtmosState = {
  catalog: null,
  selection: { followLatest: true, key: null },
  displayedFrame: null,
  frameLoadState: "idle",
  tileErrorCount: 0,
  notice: null,
  isPlaying: false,
  speed: "normal",
  layers: {
    radar: { visible: true, opacity: 0.8 },
    coverage: { visible: false },
    annotations: { visible: true },
  },
  regionId: DEFAULT_REGION,
  viewRequest: { regionId: DEFAULT_REGION, nonce: 0 },
  clicked: null,
  selectedFeature: null,
  mapStatus: "loading",
  mapError: null,
  basemapError: false,
  budget: { used: 0, limit: 0, cooldownUntil: 0 },
  mobilePanelOpen: false,
  mapZoom: 3,
};

function frames(s: AtmosState): RadarFrame[] {
  return s.catalog?.frames ?? [];
}

function selectionFor(list: RadarFrame[], key: string): FrameSelection {
  return { key, followLatest: list.length > 0 && list[list.length - 1].key === key };
}

export const createAtmosStore = () =>
  create<AtmosState & AtmosActions>()(
    subscribeWithSelector((set, get) => ({
      ...initialAtmosState,

      setCatalog(catalog) {
        const s = get();
        const { selection, notice } = reconcileSelection(
          catalog.frames,
          s.selection,
          frames(s),
        );
        // While playing, the selection is driven by playback and is pinned;
        // reconciling still replaces a frame that expired mid-loop.
        set({ catalog, selection, notice: notice ?? s.notice });
      },

      selectFrame(key) {
        // Any direct selection (scrub, click) pauses playback.
        set({ selection: selectionFor(frames(get()), key), isPlaying: false });
      },

      playbackAdvance() {
        const list = frames(get());
        if (list.length === 0) return;
        const i = nextIndex(indexOfKey(list, get().selection.key), list.length);
        set({ selection: { key: list[i].key, followLatest: false } });
      },

      stepFrame(delta) {
        const list = frames(get());
        if (list.length === 0) return;
        const cur = indexOfKey(list, get().selection.key);
        const i = delta === 1 ? nextIndex(cur, list.length) : prevIndex(cur, list.length);
        set({ selection: selectionFor(list, list[i].key), isPlaying: false });
      },

      goLatest() {
        const list = frames(get());
        set({
          isPlaying: false,
          selection: { followLatest: true, key: list.length ? list[list.length - 1].key : null },
        });
      },

      setPlaying(playing) {
        const s = get();
        if (playing && frames(s).length < 2) return;
        set({
          isPlaying: playing,
          // Playback walks through history, so stop "following latest".
          selection: playing ? { ...s.selection, followLatest: false } : s.selection,
        });
      },

      togglePlaying() {
        get().setPlaying(!get().isPlaying);
      },

      setSpeed: (speed) => set({ speed }),
      setDisplayed: (displayedFrame) => set({ displayedFrame }),
      setFrameLoadState: (frameLoadState) => set({ frameLoadState }),
      setTileErrorCount: (tileErrorCount) => set({ tileErrorCount }),
      dismissNotice: () => set({ notice: null }),

      setLayerVisible(layer, visible) {
        const layers = get().layers;
        set({ layers: { ...layers, [layer]: { ...layers[layer], visible } } });
        if (layer === "annotations" && !visible) set({ selectedFeature: null });
      },

      setRadarOpacity(opacity) {
        const layers = get().layers;
        set({ layers: { ...layers, radar: { ...layers.radar, opacity } } });
      },

      selectRegion(regionId) {
        set({ regionId, viewRequest: { regionId, nonce: get().viewRequest.nonce + 1 } });
      },

      resetView() {
        const regionId = get().regionId;
        set({ viewRequest: { regionId, nonce: get().viewRequest.nonce + 1 } });
      },

      setClicked: (clicked) => set({ clicked }),
      setSelectedFeature: (selectedFeature) => set({ selectedFeature }),
      setMapStatus: (mapStatus, mapError = null) => set({ mapStatus, mapError }),
      setBasemapError: (basemapError) => set({ basemapError }),
      setBudget: (budget) => set({ budget }),
      setMobilePanelOpen: (mobilePanelOpen) => set({ mobilePanelOpen }),
      setMapZoom: (mapZoom) => set({ mapZoom }),
    })),
  );

export const useAtmosStore = createAtmosStore();
export type AtmosStore = typeof useAtmosStore;

/** Derived helpers kept outside the store so components select minimal slices. */
export function getSelectedFrame(s: AtmosState): RadarFrame | null {
  return frames(s).find((f) => f.key === s.selection.key) ?? null;
}
