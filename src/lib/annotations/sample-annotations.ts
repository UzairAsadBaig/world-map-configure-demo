import type { FeatureCollection, Point, Polygon } from "geojson";

/**
 * SAMPLE ANNOTATIONS: hand-written for this prototype to demonstrate vector
 * overlays and feature interaction. They are NOT weather observations,
 * forecasts, warnings or alerts, and no official body issued them.
 * Coordinates are [longitude, latitude].
 */
export interface AnnotationProperties {
  id: string;
  title: string;
  kind: "study-area" | "point-of-interest";
  note: string;
}

export const SAMPLE_ANNOTATIONS: FeatureCollection<Polygon | Point, AnnotationProperties> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "gulf-coast",
        title: "Gulf Coast study area",
        kind: "study-area",
        note: "Example region outline used to demonstrate polygon overlays and click interaction.",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[-97.5, 27.5], [-88.0, 28.8], [-87.5, 31.5], [-97.0, 31.0], [-97.5, 27.5]]],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "great-plains",
        title: "Great Plains study area",
        kind: "study-area",
        note: "Example region outline. Drawn by hand; it does not follow any official boundary.",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[-103.0, 34.5], [-95.0, 34.5], [-95.0, 41.0], [-103.0, 41.0], [-103.0, 34.5]]],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "north-sea",
        title: "North Sea study area",
        kind: "study-area",
        note: "Example offshore outline used to compare radar coverage over sea and land.",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[0.5, 52.8], [7.5, 53.5], [7.0, 57.5], [1.0, 58.0], [0.5, 52.8]]],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "chicago",
        title: "Chicago (sample point)",
        kind: "point-of-interest",
        note: "Example point of interest. Clicking it shows these details, not measured weather.",
      },
      geometry: { type: "Point", coordinates: [-87.6298, 41.8781] },
    },
    {
      type: "Feature",
      properties: {
        id: "london",
        title: "London (sample point)",
        kind: "point-of-interest",
        note: "Example point of interest. Clicking it shows these details, not measured weather.",
      },
      geometry: { type: "Point", coordinates: [-0.1276, 51.5072] },
    },
    {
      type: "Feature",
      properties: {
        id: "munich",
        title: "Munich (sample point)",
        kind: "point-of-interest",
        note: "Example point of interest. Clicking it shows these details, not measured weather.",
      },
      geometry: { type: "Point", coordinates: [11.582, 48.1351] },
    },
  ],
};
