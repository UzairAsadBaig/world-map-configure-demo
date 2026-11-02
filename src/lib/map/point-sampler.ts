import { HttpError, type RequestBudget } from "@/lib/net/request-budget";
import { fillTemplate, lngLatToTile, sourceTileZoom } from "./tiles";

/**
 * Reads one pixel of a provider tile at a clicked location.
 *
 * Used only for *qualitative* states:
 *  - coverage mask: opaque (black) pixel = outside radar coverage, as documented;
 *  - radar frame: whether any colour was drawn at that pixel.
 * We never convert colours back to reflectivity or rain rate, and a
 * transparent radar pixel is reported as "nothing drawn", not "no rain".
 */
export interface PixelSample {
  r: number;
  g: number;
  b: number;
  a: number;
}

export async function samplePixel(
  template: string,
  lng: number,
  lat: number,
  mapZoom: number,
  tileSize: number,
  maxzoom: number,
  budget: RequestBudget,
  signal: AbortSignal,
): Promise<PixelSample> {
  // Same tile zoom MapLibre is drawing, so the request is usually an HTTP-cache hit.
  const z = sourceTileZoom(mapZoom, tileSize, maxzoom);
  const t = lngLatToTile(lng, lat, z);
  const url = fillTemplate(template, z, t.x, t.y);
  budget.record(url);
  const res = await fetch(url, { signal, mode: "cors" });
  if (!res.ok) throw new HttpError(res.status, `Tile request failed (HTTP ${res.status}).`);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    const px = Math.min(bitmap.width - 1, Math.floor(t.fx * bitmap.width));
    const py = Math.min(bitmap.height - 1, Math.floor(t.fy * bitmap.height));
    ctx.drawImage(bitmap, px, py, 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a };
  } finally {
    bitmap.close();
  }
}
