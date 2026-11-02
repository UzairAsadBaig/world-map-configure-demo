import { describe, expect, it } from "vitest";
import { estimateTilesForView, lngLatToTile, sourceTileZoom } from "@/lib/map/tiles";

describe("tile math", () => {
  it("converts lng/lat to slippy-map tiles (lng first)", () => {
    // London at z4 is tile x=7, y=5.
    const t = lngLatToTile(-0.1276, 51.5072, 4);
    expect([t.x, t.y]).toEqual([7, 5]);
    // Swapping lat/lng would land in a completely different tile.
    const swapped = lngLatToTile(51.5072, -0.1276, 4);
    expect([swapped.x, swapped.y]).not.toEqual([7, 5]);
  });

  it("wraps longitudes beyond the antimeridian", () => {
    expect(lngLatToTile(190, 0, 2).x).toBe(lngLatToTile(-170, 0, 2).x);
  });

  it("rounds raster tile zoom like MapLibre and caps at the native max", () => {
    expect(sourceTileZoom(3.4, 512, 7)).toBe(3);
    expect(sourceTileZoom(3.5, 512, 7)).toBe(4);
    expect(sourceTileZoom(3.5, 256, 7)).toBe(5);
    expect(sourceTileZoom(11, 512, 7)).toBe(7);
  });

  it("estimates a bounded tile count for a viewport", () => {
    // Observed in the browser: a 1140x810 map at zoom ~3.5 requested 12 tiles.
    // The estimate is a worst case (tile grid offset), so it may exceed that,
    // but must never be below what MapLibre actually requests.
    const n = estimateTilesForView(1140, 810, 3.5, 512, 7);
    expect(n).toBeGreaterThanOrEqual(12);
    expect(n).toBeLessThanOrEqual(20);
    // Never more tiles than the zoom level has.
    expect(estimateTilesForView(4000, 4000, 0, 512, 7)).toBe(1);
  });
});
