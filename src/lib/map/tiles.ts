/** Web-Mercator tile math shared by the request estimator and the point sampler. */

export function lngLatToTile(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const latRad = (clampedLat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  // Wrap x so longitudes beyond ±180 (after panning across the antimeridian) still resolve.
  const wrappedX = ((x % n) + n) % n;
  return {
    x: Math.min(Math.floor(wrappedX), n - 1),
    y: Math.min(Math.max(Math.floor(y), 0), n - 1),
    fx: wrappedX - Math.floor(wrappedX),
    fy: y - Math.floor(y),
  };
}

/**
 * Tile zoom MapLibre requests for a raster source with `tileSize` px tiles at
 * map zoom `zoom`, limited by the source's `maxzoom` (beyond it MapLibre over-zooms).
 * Raster sources use `roundZoom`, so MapLibre rounds rather than floors here.
 */
export function sourceTileZoom(zoom: number, tileSize: number, maxzoom: number): number {
  const z = Math.round(zoom + Math.log2(512 / tileSize));
  return Math.max(0, Math.min(maxzoom, z));
}

/** Upper-bound estimate of how many tiles one raster frame needs for a viewport. */
export function estimateTilesForView(
  widthPx: number,
  heightPx: number,
  zoom: number,
  tileSize: number,
  maxzoom: number,
): number {
  const tz = sourceTileZoom(zoom, tileSize, maxzoom);
  // The world is 512·2^zoom CSS px wide in MapLibre, split into 2^tz tiles.
  const tilePx = 512 * 2 ** (zoom - tz);
  const cols = Math.min(2 ** tz, Math.ceil(widthPx / tilePx) + 1);
  const rows = Math.min(2 ** tz, Math.ceil(heightPx / tilePx) + 1);
  return Math.max(1, cols * rows);
}

export function fillTemplate(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}
