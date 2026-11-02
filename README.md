# Atmos — Weather Map

A personal learning prototype: an interactive weather-radar map showing the
**real** last ~2 hours of composite radar from RainViewer on an OpenFreeMap
basemap, with animated playback, a timeline, three independent layers, and
region presets.

> Radar imagery and the coverage mask are real provider data. The violet
> "Sample annotations" are hand-drawn examples for exercising vector layers.
> They are **not** observations, forecasts or alerts. No forecast, satellite,
> temperature, wind or alert data is shown, and none is invented.

## Run it

Requires Node 20+ (tested with Node 24.3, npm 11.4).

```bash
npm install
npm run dev          # http://localhost:3000 (development)
```

Production / static export (what a CDN would serve):

```bash
npm run build        # writes the static site to out/
npm start            # serves out/ at http://localhost:4173
```

Checks:

```bash
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint (next core-web-vitals + typescript)
npm test             # vitest unit tests
npm run build && npx playwright test   # browser tests against out/
```

The Playwright tests use real RainViewer data and run serially to limit load
on the provider. Tiles are fetched once per run and replayed from memory.
Avoid running the suite repeatedly back to back.

## Using it

- **Region**: USA / Europe / UK presets and *Reset view*. Pan and zoom freely.
  Zoom controls and the scale bar are on the map.
- **Timeline** (bottom): play/pause, previous/next, *Latest*, speed
  (0.5×/1×/2×), and a draggable frame slider. Dragging pauses playback.
  With the slider focused: ←/→ step, Home/End jump, **K** or Space play/pause,
  **L** latest, **,** and **.** step. Shortcuts only apply while focus is
  inside the timeline and never while typing in a field.
- The label on the right always describes the frame **actually drawn**:
  `LATEST` (green) or `HISTORICAL` (amber), plus its UTC time. While another
  frame loads, the old frame stays on screen and the label says
  `Loading HH:MM` or `Waiting for request budget`.
- **Layers**: radar (toggle and opacity), coverage mask (toggle), sample
  annotations (toggle; click one for details).
- **Click the map** to see coordinates, the displayed frame, active layers,
  and a qualitative radar state for that point (see *Location states* below).
- Header: when the frame list was generated, staleness and errors, manual
  refresh, and the request-budget meter (large screens).

## Architecture

```
src/
  app/                    layout.tsx, page.tsx: Server Component shell (static)
  components/
    map/                  map-loader (next/dynamic, ssr:false), map-view, overlays
    timeline/             timeline controls
    panels/               layers, regions, legend, location details, mobile sheet
    header/               data status, refresh
    ui/                   shadcn/ui components (Base UI primitives)
  lib/
    radar/                provider interface, RainViewer adapter (Zod), frame logic,
                          palette (generated from the provider CSV), metadata query
    map/                  MapController (map lifecycle and layers),
                          RadarFrameManager (frame sources, cache, swap, budget),
                          tile math, point sampler, regions
    playback/             PlaybackController (timers, outside React)
    net/                  RequestBudget (rate-limit accounting and backoff)
    annotations/          sample GeoJSON (labelled as sample)
  store/                  Zustand store (serialisable UI state only)
tests/unit                Vitest
tests/e2e                 Playwright
```

**Data flow**

1. `RadarDataSync` is the single TanStack Query observer that polls
   `weather-maps.json` (about every 5 minutes, retry with backoff, no polling
   in hidden tabs). Other components read the same query with `enabled:false`,
   so they never start their own polling.
2. The RainViewer adapter validates the response with Zod and turns it into
   provider-neutral `RadarFrame`s sorted by time. `setCatalog` reconciles the
   selection: follow latest, keep a pinned frame, or replace an expired frame
   with the nearest remaining one and explain the change.
3. `MapController` (created once per mount and destroyed on unmount, including
   strict-mode remounts) subscribes to the store from **outside React** and
   drives MapLibre imperatively. React never holds the map instance.
4. `RadarFrameManager` keeps one raster source/layer per frame, at most 4
   (LRU). A new frame loads at opacity 0 while the previous one stays
   visible. The swap happens only when the **current target** has no
   outstanding tiles, so a frame that finishes loading after the user
   scrubbed past it is never shown. Evicting a source makes MapLibre abort its
   in-flight tile requests (cancellation). A region jump cancels all
   non-displayed, non-target sources.
5. `PlaybackController` is display-paced. It selects the next frame only after
   the current one has been drawn and held for its dwell time, then preloads
   just the next frame. When loading is slow or the request budget is spent,
   playback waits (shown as buffering) instead of skipping or promising a frame
   rate. Timers stop in hidden tabs.
6. React re-renders at most once per frame change (a few times per second),
   never per animation frame.

**Request budget.** RainViewer documents 100 requests/IP/minute. Every provider
URL passes through `RequestBudget`: tiles via MapLibre's `transformRequest`,
plus metadata and point samples. The budget is 85/minute, leaving headroom.
Only the first request per tile URL counts, because tiles are served with
`Cache-Control: max-age=172800` and repeats should be HTTP-cache hits. Before
the frame manager starts a frame, it estimates the viewport's tile count
(worst case) and waits if the budget can't cover it. Preloading only happens
when less than half the budget is used. An HTTP 429 from a tile puts the
budget into exponential backoff (15 s → 2 min). Metadata retries back off
longer after a 429. At a 1440×900 desktop viewport over CONUS a frame costs
about 12 tiles, so the **first** pass through 13 frames takes longer than a
minute. Later loops are served from cache.

**MapLibre worker (Next.js 16 + Turbopack).** MapLibre GL JS 6 is ESM-only.
Following its docs for Next.js/Turbopack, `map-view.tsx` calls
`setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString())`,
and Next.js emits the worker as a hashed static asset (works in the export).

**Adding a provider.** Implement `RadarProvider` (`src/lib/radar/types.ts`):
metadata URL, `parseCatalog`, tile size, limits, legend stops, attribution and
terms. Then point `activeProvider` at it. UI components read only that
interface.

## Data sources, attribution and restrictions

| Source | Use | Notes |
| --- | --- | --- |
| [RainViewer Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html) | `https://api.rainviewer.com/public/weather-maps.json`, `radar.past` frames; tiles `{host}{path}/512/{z}/{x}/{y}/2/1_1.png`; coverage `/v2/coverage/0/512/{z}/{x}/{y}/0/0_0.png` | **Personal and educational use only.** Checked against the [transition FAQ](https://www.rainviewer.com/api/transition-faq.html) on 2026-11-02: past radar only (2 h, 10-minute steps), max zoom 7, Universal Blue palette (ID 2) only, 100 requests/IP/minute, nowcast and satellite discontinued. |
| [RainViewer colour table](https://www.rainviewer.com/api/color-schemes.html) | Legend | `universal-blue-palette.ts` is generated from the official CSV (`rainviewer_api_colors_table.csv`), rain and snow ramps every 5 dBZ from −10 to 75. Nothing is interpolated or invented. |
| [OpenFreeMap](https://openfreemap.org/quick_start/) "dark" style | Basemap | Attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" is shown by MapLibre's attribution control (from the style's TileJSON) and in the legend. |

Timestamp semantics: RainViewer documents a frame's `time` as the **frame
generation time**, not the exact observation time. The UI says "Generated N
min ago" and repeats this in the legend.

Observed while building (2026-11-02), and handled:

- Tile responses carry `x-ratelimit-limit: 500` per 60 s headers. The
  documented 100/min is stricter, so the app budgets to the documentation.
- Requests above zoom 7 return a 200 PNG reading "Zoom Level Not Supported".
  Sources are therefore capped at `maxzoom: 7` and MapLibre over-zooms. Past
  map zoom 8 an overlay explains that radar detail no longer increases (the
  basemap goes to zoom 12).
- An unknown/expired frame path still returns **200 with imagery**, so expired
  frames can't be detected from tile responses. Expiry is decided from the
  metadata only.
- 512 px tiles cover the same z/x/y area as 256 px tiles at twice the
  resolution, so the app uses `tileSize: 512` and needs about 4× fewer
  requests.

## Location states

Clicking the map samples one pixel of the provider's coverage tile and the
displayed radar tile at the same tile zoom MapLibre is drawing, which is
usually a cache hit. The result is only ever one of:

- **Request failed**: tiles couldn't be read.
- **Outside radar coverage**: the documented mask is opaque there. No colour
  means no data, not dry weather.
- **Inside coverage, no echo drawn**: with an explicit caveat that a blank
  pixel does not prove there is no precipitation.
- **Radar echo drawn**: a colour swatch, pointing to the legend.

Colours are never converted back to dBZ or rain rates. Sampling is skipped
during playback (it would cost two requests per frame).

View-level states are shown over the map: loading, buffering, waiting for the
request budget, tile failures (count), metadata failure (basemap stays
usable), empty frame list, stale data (header), expired-frame replacement
(dismissible notice), and over-zoom.

## Known limitations

- **No view-wide "no precipitation" detection.** The app distinguishes
  loading, failure, outside coverage and "no echo drawn" at a clicked point,
  but does not analyse whole viewports for the absence of echoes.
- The request-budget estimate is client-side and approximate. It can't see
  other tabs or devices on the same IP, and it treats repeat URLs as cache
  hits.
- The first loop of animation over a large viewport is budget-limited (about
  7 new frames per minute at desktop size), by design.
- `next build` copies MapLibre's unused dev bundles into `out/_next/static/media`
  (≈3.7 MB on disk) because of a dynamic `new URL()` inside MapLibre. Browsers
  never download them. Delete them before upload if deploy size matters.
- Hot-reloading `src/store` or modules it imports during `npm run dev` can
  leave the map bound to an old store instance. Reload the page. Production is
  unaffected.
- No offline/fixture mode was implemented. If RainViewer is unreachable, the
  app shows the failure and keeps the basemap. It never substitutes synthetic
  weather.
- shadcn/ui's current CLI generates Base UI (not Radix) primitives
  (`base-nova` style). `slider.tsx` was extended to forward `aria-label` and
  `getAriaValueText` to the thumb.

## Future: a Python processing service

To go beyond pre-rendered PNG tiles (for example real values at a point, or
other variables), a small upstream service could do the following:

1. **Ingest** raw model or radar output (GRIB2 from NOAA MRMS/HRRR or ECMWF
   open data, netCDF/ODIM HDF5 from national radar networks) on a schedule
   into object storage.
2. **Decode and normalise** with `xarray` + `cfgrib` (GRIB2) or `netCDF4`/`h5netcdf`.
   Select variables, apply scale/offset and units with CF metadata, and
   reproject to EPSG:3857 with `rioxarray`/`rasterio` (GDAL warp under the
   hood).
3. **Publish rasters** as Cloud-Optimized GeoTIFFs per timestep (`rasterio`
   or `gdal_translate -of COG`), then either pre-render XYZ PNG/WebP tiles with
   a documented palette (`gdal2tiles` or `rio-tiler`), or serve them
   dynamically with **TiTiler** (FastAPI + rio-tiler) behind a CDN.
4. **Expose numbers**: a FastAPI endpoint like `/point?lat=&lon=&time=` that
   reads the COG pixel (with units, valid time vs. generation time, and
   provenance), plus a metadata endpoint shaped like `RadarCatalog`. The
   frontend would gain a second `RadarProvider` and a real-value panel.
   No colour inversion needed.
5. Operational concerns: data licences per source, retention windows, cache
   headers per timestep (immutable tiles, short-lived catalogs), and
   monitoring for late or missing runs.

## Static deployment (S3 + CloudFront) — guide only, not deployed

1. `npm run build` → upload `out/` to a **private** S3 bucket (for example
   `aws s3 sync out/ s3://BUCKET/ --delete`). Optionally drop the unused
   `maplibre-gl-*-dev*.mjs` and `*-shared*.mjs` files first.
2. CloudFront distribution with the bucket as origin via **Origin Access
   Control**. Default root object `index.html`.
3. **Caching**:
   - `/_next/static/*` is content-hashed: `Cache-Control: public, max-age=31536000, immutable`.
   - `index.html`, `404.html` and the `*.txt` RSC payloads: `no-cache` (or a
     short max-age) so new deploys show up immediately. Set these with
     per-prefix `aws s3 cp --cache-control` or a CloudFront response-headers
     policy.
   - Ensure `.mjs` is served as `text/javascript` (S3 may guess wrong; set
     `--content-type` explicitly). The MapLibre worker fails to load otherwise.
4. **Routing**: the app has one route (`/`). Map 403/404 from S3 to
   `/404.html` (status 404). An SPA rewrite is not needed. With more routes,
   add `trailingSlash: true` or a CloudFront Function that appends `.html`.
5. **CSP** (optional): `worker-src 'self'`, `img-src 'self' data: blob: https://tilecache.rainviewer.com https://tiles.openfreemap.org`,
   `connect-src 'self' https://api.rainviewer.com https://tilecache.rainviewer.com https://tiles.openfreemap.org`.
6. No server or proxy is required: all data is fetched by the browser from
   CORS-enabled public endpoints. A proxy would add infrastructure and would
   concentrate every user's requests on one IP, which conflicts with the
   per-IP limit.

## Walkthrough script

See [docs/walkthrough.md](docs/walkthrough.md).
