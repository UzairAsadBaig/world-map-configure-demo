import { rainViewerProvider } from "./rainviewer";
import type { RadarProvider } from "./types";

/**
 * The radar provider the app runs against. Swapping providers means
 * implementing `RadarProvider` and changing this line; UI code reads
 * everything provider-specific through this object.
 */
export const activeProvider: RadarProvider = rainViewerProvider;
