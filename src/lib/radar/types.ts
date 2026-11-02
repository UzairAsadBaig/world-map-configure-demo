import type { PaletteStop } from "./universal-blue-palette";

/**
 * One radar image in time. `key` is the provider's stable identifier for the
 * frame (RainViewer's `path`), `time` is the provider timestamp in Unix seconds.
 * Frames are plain serialisable objects so they can live in Zustand / Query caches.
 */
export interface RadarFrame {
  key: string;
  /** Unix seconds (UTC). Semantics are described by `RadarProvider.timeSemantics`. */
  time: number;
  /** MapLibre raster tile URL template ({z}/{x}/{y}) for this frame. */
  tileUrl: string;
}

export interface RadarCatalog {
  providerId: string;
  /** Unix seconds when the provider generated the metadata document. */
  generatedAt: number;
  /** Chronologically ascending, de-duplicated. */
  frames: RadarFrame[];
}

export interface ProviderLimits {
  /** Highest tile zoom the provider serves. MapLibre over-zooms beyond this. */
  maxNativeZoom: number;
  /** Documented request ceiling per IP per minute (tiles + metadata). */
  requestsPerMinute: number;
  historyMinutes: number;
  frameIntervalMinutes: number;
}

/**
 * Everything provider-specific lives behind this interface so presentation
 * components never see URLs, palette IDs or limits directly. Adding a second
 * radar provider means writing another object that satisfies it.
 */
export interface RadarProvider {
  id: string;
  name: string;
  metadataUrl: string;
  /** Validates and normalises a raw metadata response. Throws on bad input. */
  parseCatalog(raw: unknown): RadarCatalog;
  /** Coverage mask tile template, if the provider publishes one. */
  coverageTileUrl: string | null;
  /** Tile size in px that the URLs above request (and MapLibre should assume). */
  tileSize: number;
  limits: ProviderLimits;
  /** Human-readable explanation of what a frame's `time` means. */
  timeSemantics: string;
  legend: {
    name: string;
    units: string;
    stops: readonly PaletteStop[];
    /** True when snow is drawn with its own colour ramp. */
    showsSnow: boolean;
  };
  coverageDescription: string;
  attribution: { label: string; url: string };
  usageTerms: string;
  /** Hosts whose requests count against the provider's rate limit. */
  rateLimitedHosts: string[];
}
