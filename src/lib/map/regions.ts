/** Bounds are [[west, south], [east, north]] in longitude/latitude (EPSG:4326). */
export type LngLatBounds = [[number, number], [number, number]];

export interface RegionPreset {
  id: "conus" | "europe" | "uk";
  label: string;
  shortLabel: string;
  bounds: LngLatBounds;
}

export const REGIONS: readonly RegionPreset[] = [
  { id: "conus", label: "Continental US", shortLabel: "USA", bounds: [[-125.0, 24.0], [-66.5, 49.5]] },
  { id: "europe", label: "Europe", shortLabel: "Europe", bounds: [[-11.0, 35.0], [32.0, 61.0]] },
  { id: "uk", label: "United Kingdom", shortLabel: "UK", bounds: [[-8.7, 49.8], [2.0, 59.0]] },
];

export type RegionId = RegionPreset["id"];

/** CONUS has dense, well-documented radar coverage, so it is the initial view. */
export const DEFAULT_REGION: RegionId = "conus";

export function getRegion(id: RegionId): RegionPreset {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}
