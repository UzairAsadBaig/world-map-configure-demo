import { z } from "zod";
import { sortFrames } from "./frames";
import type { RadarCatalog, RadarProvider } from "./types";
import { UNIVERSAL_BLUE_STOPS } from "./universal-blue-palette";

/**
 * RainViewer Weather Maps API adapter.
 * Docs: https://www.rainviewer.com/api/weather-maps-api.html
 * Limits: https://www.rainviewer.com/api/transition-faq.html
 *
 * Tile template (documented): {host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png
 *   size    256 | 512
 *   color   2 = Universal Blue (the only scheme still offered)
 *   options {smooth}_{snow}; we request 1_1 (smoothed, snow in its own colours),
 *           matching RainViewer's official MapLibre example.
 */

const TILE_SIZE = 512; // 512px tiles cover the same z/x/y area as 256px ones at
// double resolution, so MapLibre needs ~4x fewer requests per viewport, which
// matters under a 100 requests/minute budget.
const COLOR_SCHEME = 2;
const OPTIONS = "1_1";

const frameSchema = z.object({
  time: z.number().int().positive(),
  path: z.string().regex(/^\/[\w/-]+$/, "unexpected frame path"),
});

const metadataSchema = z.object({
  version: z.string().optional(),
  generated: z.number().int().positive(),
  host: z.url({ protocol: /^https$/ }),
  radar: z.object({
    past: z.array(frameSchema),
    nowcast: z.array(frameSchema).optional(),
  }),
});

export type RainViewerMetadata = z.infer<typeof metadataSchema>;

function parseCatalog(raw: unknown): RadarCatalog {
  const data = metadataSchema.parse(raw);
  const host = data.host.replace(/\/$/, "");
  // Only `radar.past` is used. Nowcast is documented as discontinued; we never
  // present an empty or stale nowcast array as forecast data.
  const frames = sortFrames(
    data.radar.past.map((f) => ({
      key: f.path,
      time: f.time,
      tileUrl: `${host}${f.path}/${TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${OPTIONS}.png`,
    })),
  );
  return { providerId: "rainviewer", generatedAt: data.generated, frames };
}

export const rainViewerProvider: RadarProvider = {
  id: "rainviewer",
  name: "RainViewer",
  metadataUrl: "https://api.rainviewer.com/public/weather-maps.json",
  parseCatalog,
  // Documented coverage mask: transparent = covered by radar, black = no coverage.
  coverageTileUrl: `https://tilecache.rainviewer.com/v2/coverage/0/${TILE_SIZE}/{z}/{x}/{y}/0/0_0.png`,
  tileSize: TILE_SIZE,
  limits: {
    maxNativeZoom: 7,
    requestsPerMinute: 100,
    historyMinutes: 120,
    frameIntervalMinutes: 10,
  },
  timeSemantics:
    "RainViewer documents frame time as the frame generation time, not the exact time the radar data was observed.",
  legend: {
    name: "Universal Blue",
    units: "dBZ",
    stops: UNIVERSAL_BLUE_STOPS,
    showsSnow: true,
  },
  coverageDescription:
    "Shaded areas have no radar coverage in RainViewer's network. Absence of colour there means no data, not dry weather.",
  attribution: { label: "RainViewer", url: "https://www.rainviewer.com/" },
  usageTerms:
    "RainViewer's public API is offered for personal and educational use only.",
  rateLimitedHosts: ["tilecache.rainviewer.com", "api.rainviewer.com"],
};
