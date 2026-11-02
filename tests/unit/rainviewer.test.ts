import { describe, expect, it } from "vitest";
import { rainViewerProvider } from "@/lib/radar/rainviewer";

const sample = {
  version: "2.0",
  generated: 1793640322,
  host: "https://tilecache.rainviewer.com",
  radar: {
    past: [
      { time: 1793633400, path: "/v2/radar/3c12876ab070" },
      { time: 1793632800, path: "/v2/radar/39473ee544ae" },
    ],
    nowcast: [],
  },
  satellite: { infrared: [] },
};

describe("rainViewerProvider.parseCatalog", () => {
  it("validates, sorts and builds documented tile URLs", () => {
    const c = rainViewerProvider.parseCatalog(sample);
    expect(c.generatedAt).toBe(1793640322);
    expect(c.frames.map((f) => f.time)).toEqual([1793632800, 1793633400]);
    expect(c.frames[0].tileUrl).toBe(
      "https://tilecache.rainviewer.com/v2/radar/39473ee544ae/512/{z}/{x}/{y}/2/1_1.png",
    );
  });

  it("rejects metadata that does not match the documented shape", () => {
    expect(() => rainViewerProvider.parseCatalog({ ...sample, host: "not a url" })).toThrow();
    expect(() => rainViewerProvider.parseCatalog({ ...sample, radar: {} })).toThrow();
    expect(() =>
      rainViewerProvider.parseCatalog({ ...sample, radar: { past: [{ time: "x", path: "/a" }] } }),
    ).toThrow();
    expect(() => rainViewerProvider.parseCatalog(null)).toThrow();
  });

  it("rejects non-https hosts and odd paths", () => {
    expect(() => rainViewerProvider.parseCatalog({ ...sample, host: "http://evil.test" })).toThrow();
    expect(() =>
      rainViewerProvider.parseCatalog({
        ...sample,
        radar: { past: [{ time: 1, path: "/v2/radar/<script>" }] },
      }),
    ).toThrow();
  });

  it("exposes the documented limits", () => {
    expect(rainViewerProvider.limits.maxNativeZoom).toBe(7);
    expect(rainViewerProvider.limits.requestsPerMinute).toBe(100);
  });
});
