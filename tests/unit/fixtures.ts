import type { RadarCatalog, RadarFrame } from "@/lib/radar/types";

/** Synthetic frames for logic tests only; never shown in the app. */
export function makeFrames(count: number, start = 1_800_000_000, stepS = 600): RadarFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `/v2/radar/f${start + i * stepS}`,
    time: start + i * stepS,
    tileUrl: `https://example.test/f${start + i * stepS}/{z}/{x}/{y}.png`,
  }));
}

export function makeCatalog(frames: RadarFrame[]): RadarCatalog {
  return { providerId: "test", generatedAt: frames.at(-1)?.time ?? 0, frames };
}
