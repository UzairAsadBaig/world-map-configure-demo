import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from "maplibre-gl";
import { SAMPLE_ANNOTATIONS, type AnnotationProperties } from "@/lib/annotations/sample-annotations";
import { indexOfKey } from "@/lib/radar/frames";
import type { RadarProvider } from "@/lib/radar/types";
import { isRateLimitedUrl, type RequestBudget } from "@/lib/net/request-budget";
import { PlaybackController } from "@/lib/playback/playback-controller";
import type { AtmosStore } from "@/store/atmos-store";
import { RadarFrameManager } from "./radar-frame-manager";
import { getRegion, type RegionId } from "./regions";

export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

const COVERAGE_ID = "radar-coverage";
const ANN_SOURCE = "sample-annotations";
const ANN_FILL = "sample-annotations-fill";
const ANN_LINE = "sample-annotations-line";
const ANN_POINT = "sample-annotations-point";
const ANN_LABEL = "sample-annotations-label";
const ANN_INTERACTIVE = [ANN_FILL, ANN_POINT];
/** Annotation outline colour: violet is not used by the Universal Blue palette. */
const ANN_COLOR = "#a78bfa";

interface ControllerOptions {
  container: HTMLElement;
  provider: RadarProvider;
  budget: RequestBudget;
  store: AtmosStore;
}

/**
 * Owns the MapLibre map for its whole life: created once, never re-created on
 * timestep changes, and torn down completely in `destroy()` (React strict-mode
 * remounts create a fresh controller after destroying the old one).
 *
 * React never touches the map directly. The controller subscribes to the
 * Zustand store and translates state changes into imperative MapLibre calls.
 */
export class MapController {
  readonly map: MapLibreMap;
  private frames: RadarFrameManager | null = null;
  private playback: PlaybackController;
  private unsubs: Array<() => void> = [];
  private resizeObserver: ResizeObserver;
  private marker: Marker | null = null;
  private destroyed = false;
  private reducedMotion: boolean;

  constructor(private readonly opts: ControllerOptions) {
    const { container, provider, budget, store } = opts;
    const region = getRegion(store.getState().regionId);
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    this.map = new MapLibreMap({
      container,
      style: BASEMAP_STYLE_URL,
      bounds: region.bounds,
      fitBoundsOptions: { padding: this.fitPadding() },
      maxZoom: 12,
      minZoom: 1,
      attributionControl: false,
      // Counted here because MapLibre owns tile fetching; see RequestBudget.
      transformRequest: (url) => {
        if (isRateLimitedUrl(url, provider.rateLimitedHosts)) budget.record(url);
        return undefined;
      },
    });

    this.map.addControl(new NavigationControl({ visualizePitch: false, showCompass: true }), "top-right");
    this.map.addControl(new ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");
    this.map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: "Sample annotations are illustrative, not official data",
      }),
      "bottom-right",
    );
    this.map.dragRotate.disable();
    this.map.touchZoomRotate.disableRotation();

    this.playback = new PlaybackController({
      getSnapshot: () => {
        const s = store.getState();
        return {
          isPlaying: s.isPlaying,
          speed: s.speed,
          frames: s.catalog?.frames ?? [],
          selectedKey: s.selection.key,
          displayedKey: s.displayedFrame?.key ?? null,
          radarVisible: s.layers.radar.visible,
        };
      },
      advance: () => store.getState().playbackAdvance(),
      preload: (f) => this.frames?.preload(f),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (h) => window.clearTimeout(h as number),
      isDocumentHidden: () => document.visibilityState === "hidden",
    });

    // Panels opening/closing change the container size without a window resize.
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.destroyed) this.map.resize();
    });
    this.resizeObserver.observe(container);

    document.addEventListener("visibilitychange", this.handleVisibility);

    this.map.on("load", this.handleLoad);
    this.map.on("error", this.handleMapError);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.playback.cancel();
    this.frames?.destroy();
    this.frames = null;
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.marker?.remove();
    // map.remove() releases the WebGL context, workers' tile state, DOM
    // listeners and any in-flight requests.
    this.map.remove();
  }

  private fitPadding() {
    const narrow = typeof window !== "undefined" && window.innerWidth < 768;
    return narrow ? { top: 24, bottom: 24, left: 16, right: 16 } : { top: 48, bottom: 48, left: 48, right: 64 };
  }

  private handleLoad = () => {
    if (this.destroyed) return;
    const { provider, store, budget } = this.opts;
    const map = this.map;
    const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

    // 1. Coverage mask under everything we add. The provider draws "no
    //    coverage" as black; brightness min/max remaps black to a flat grey so
    //    it reads as a veil on the dark basemap.
    if (provider.coverageTileUrl) {
      map.addSource(COVERAGE_ID, {
        type: "raster",
        tiles: [provider.coverageTileUrl],
        tileSize: provider.tileSize,
        maxzoom: provider.limits.maxNativeZoom,
        attribution: `<a href="${provider.attribution.url}" target="_blank" rel="noopener">${provider.attribution.label}</a>`,
      });
      map.addLayer(
        {
          id: COVERAGE_ID,
          type: "raster",
          source: COVERAGE_ID,
          layout: { visibility: store.getState().layers.coverage.visible ? "visible" : "none" },
          paint: {
            "raster-opacity": 0.5,
            "raster-brightness-min": 0.45,
            "raster-brightness-max": 0.45,
            "raster-fade-duration": 0,
          },
        },
        firstLabel,
      );
    }

    // 2. Sample annotations: fill/outline sit above radar frames (inserted
    //    later, beneath ANN_FILL) but below basemap labels; points on top.
    map.addSource(ANN_SOURCE, { type: "geojson", data: SAMPLE_ANNOTATIONS, promoteId: "id" });
    const annVisibility = store.getState().layers.annotations.visible ? "visible" : "none";
    map.addLayer(
      {
        id: ANN_FILL,
        type: "fill",
        source: ANN_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        layout: { visibility: annVisibility },
        paint: {
          "fill-color": ANN_COLOR,
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.18, 0.06],
        },
      },
      firstLabel,
    );
    map.addLayer(
      {
        id: ANN_LINE,
        type: "line",
        source: ANN_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        layout: { visibility: annVisibility },
        paint: { "line-color": ANN_COLOR, "line-width": 1.5, "line-dasharray": [3, 2] },
      },
      firstLabel,
    );
    map.addLayer({
      id: ANN_POINT,
      type: "circle",
      source: ANN_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      layout: { visibility: annVisibility },
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 6],
        "circle-color": "#1e1b2e",
        "circle-stroke-color": ANN_COLOR,
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: ANN_LABEL,
      type: "symbol",
      source: ANN_SOURCE,
      minzoom: 3,
      layout: {
        visibility: annVisibility,
        "text-field": ["concat", ["get", "title"], "\n(sample)"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: { "text-color": "#ddd6fe", "text-halo-color": "#0b0b12", "text-halo-width": 1.2 },
    });

    // 3. Radar frames, inserted beneath the annotation fill.
    this.frames = new RadarFrameManager(map, {
      beforeId: ANN_FILL,
      tileSize: provider.tileSize,
      maxzoom: provider.limits.maxNativeZoom,
      budget,
      attribution: `<a href="${provider.attribution.url}" target="_blank" rel="noopener">${provider.attribution.label}</a>`,
      onDisplayed: (f) => store.getState().setDisplayed(f),
      onState: (st) => store.getState().setFrameLoadState(st),
      onTileErrors: (n) => store.getState().setTileErrorCount(n),
    });
    const st = store.getState();
    this.frames.setOpacity(st.layers.radar.opacity);
    this.frames.setVisible(st.layers.radar.visible);

    // On narrow screens the expanded attribution covers the scale bar and much
    // of the map. Start it collapsed; the (i) button keeps it one tap away.
    if (this.map.getContainer().clientWidth < 640) {
      this.map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    }

    this.bindInteractions();
    this.bindStore();
    store.getState().setMapStatus("ready");
  };

  private bindInteractions() {
    const map = this.map;
    const { store } = this.opts;
    let selectedId: string | null = null;

    const setSelected = (id: string | null) => {
      if (selectedId) map.setFeatureState({ source: ANN_SOURCE, id: selectedId }, { selected: false });
      selectedId = id;
      if (id) map.setFeatureState({ source: ANN_SOURCE, id }, { selected: true });
    };

    map.on("click", (e: MapMouseEvent) => {
      const layers = ANN_INTERACTIVE.filter((id) => map.getLayoutProperty(id, "visibility") !== "none");
      const hit: MapGeoJSONFeature | undefined = layers.length
        ? map.queryRenderedFeatures(e.point, { layers })[0]
        : undefined;
      const props = (hit?.properties as AnnotationProperties | undefined) ?? null;
      setSelected(props?.id ?? null);
      // wrap() normalises longitudes after panning across the antimeridian.
      const ll = e.lngLat.wrap();
      store.getState().setSelectedFeature(props);
      store.getState().setClicked({ lng: ll.lng, lat: ll.lat, zoom: map.getZoom() });
    });

    for (const id of ANN_INTERACTIVE) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }

    this.unsubs.push(
      store.subscribe(
        (s) => s.selectedFeature?.id ?? null,
        (id) => {
          if (id !== selectedId) setSelected(id);
        },
      ),
    );
  }

  private bindStore() {
    const { store, budget } = this.opts;
    const map = this.map;
    const sub = <T>(sel: (s: ReturnType<AtmosStore["getState"]>) => T, fn: (v: T) => void, fire = false) => {
      this.unsubs.push(store.subscribe(sel, fn, { fireImmediately: fire }));
    };

    // Catalog → frame sources. Also prunes sources for expired frames.
    sub((s) => s.catalog, (c) => this.frames?.setFrames(c?.frames ?? []), true);

    // Selection → what the frame manager should draw.
    sub(
      (s) => s.selection.key,
      (key) => {
        const s = store.getState();
        const list = s.catalog?.frames ?? [];
        const i = indexOfKey(list, key);
        this.frames?.show(i >= 0 ? list[i] : null);
        this.playback.sync();
      },
      true,
    );

    // Playback re-arms its timer whenever what is on screen or the play state changes.
    sub((s) => s.displayedFrame?.key ?? null, () => this.playback.sync());
    sub((s) => s.isPlaying, () => this.playback.sync());
    sub((s) => s.speed, () => this.playback.sync());

    sub((s) => s.layers.radar.opacity, (o) => this.frames?.setOpacity(o));
    sub(
      (s) => s.layers.radar.visible,
      (v) => {
        this.frames?.setVisible(v);
        this.playback.sync();
      },
    );
    sub(
      (s) => s.layers.coverage.visible,
      (v) => {
        if (map.getLayer(COVERAGE_ID)) map.setLayoutProperty(COVERAGE_ID, "visibility", v ? "visible" : "none");
      },
    );
    sub(
      (s) => s.layers.annotations.visible,
      (v) => {
        for (const id of [ANN_FILL, ANN_LINE, ANN_POINT, ANN_LABEL]) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
        }
      },
    );

    sub((s) => s.viewRequest, (r) => this.flyToRegion(r.regionId));

    sub(
      (s) => s.clicked,
      (c) => {
        if (!c) {
          this.marker?.remove();
          this.marker = null;
          return;
        }
        if (!this.marker) {
          const el = document.createElement("div");
          el.className = "atmos-click-marker";
          el.setAttribute("aria-hidden", "true");
          this.marker = new Marker({ element: el });
        }
        this.marker.setLngLat([c.lng, c.lat]).addTo(map);
      },
    );

    // Budget → store, throttled: tile bursts can record dozens of requests per second.
    let pending = false;
    const pushBudget = () => {
      if (pending) return;
      pending = true;
      window.setTimeout(() => {
        pending = false;
        if (!this.destroyed) store.getState().setBudget(budget.snapshot());
      }, 500);
    };
    this.unsubs.push(budget.subscribe(pushBudget));
    const tick = window.setInterval(pushBudget, 5000); // window slides even without new requests
    this.unsubs.push(() => window.clearInterval(tick));
    pushBudget();

    const onMoveEnd = () => store.getState().setMapZoom(map.getZoom());
    map.on("moveend", onMoveEnd);
    this.unsubs.push(() => map.off("moveend", onMoveEnd));
    onMoveEnd();
  }

  private flyToRegion(regionId: RegionId) {
    // A region jump makes queued preloads for the old viewport worthless.
    this.frames?.cancelObsolete();
    this.map.fitBounds(getRegion(regionId).bounds, {
      padding: this.fitPadding(),
      duration: this.reducedMotion ? 0 : 900,
    });
  }

  private handleVisibility = () => this.playback.sync();

  private handleMapError = (e: { error?: { message: string }; sourceId?: string }) => {
    const sid = e.sourceId;
    // Radar errors are handled by RadarFrameManager; coverage errors are non-fatal.
    if (sid?.startsWith("radar-") || sid === ANN_SOURCE) return;
    const { store } = this.opts;
    if (!this.map.isStyleLoaded() && store.getState().mapStatus === "loading") {
      store.getState().setMapStatus("error", e.error?.message ?? "The basemap style could not be loaded.");
      return;
    }
    if (sid === "openmaptiles" || sid === "ne2_shaded") store.getState().setBasemapError(true);
  };
}
