"use client";

import { setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { MapController } from "@/lib/map/map-controller";
import { providerBudget } from "@/lib/net/request-budget";
import { activeProvider } from "@/lib/radar/provider";
import { useAtmosStore } from "@/store/atmos-store";

// MapLibre v6 is ESM-only and bundlers cannot resolve its worker from
// import.meta.url on their own. This is the documented Next.js/Turbopack
// setup: Next.js emits the worker as a hashed asset (works for static export).
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapStatus = useAtmosStore((s) => s.mapStatus);
  const mapError = useAtmosStore((s) => s.mapError);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let controller: MapController | null = null;
    try {
      controller = new MapController({
        container,
        provider: activeProvider,
        budget: providerBudget,
        store: useAtmosStore,
      });
    } catch (err) {
      // Most likely WebGL is unavailable.
      useAtmosStore.getState().setMapStatus("error", err instanceof Error ? err.message : String(err));
    }
    // Opt-in inspection hook for browser tests (?e2e=1); absent otherwise.
    const debug = new URLSearchParams(window.location.search).has("e2e");
    if (debug && controller) {
      (window as unknown as Record<string, unknown>).__atmos = { map: controller.map, store: useAtmosStore };
    }
    // Strict-mode dev remounts run this cleanup and then create a fresh
    // controller, so the map and all its listeners/timers must go here.
    return () => {
      if (debug) delete (window as unknown as Record<string, unknown>).__atmos;
      controller?.destroy();
      useAtmosStore.getState().setDisplayed(null);
      useAtmosStore.getState().setMapStatus("loading");
    };
  }, []);

  return (
    <>
      {/* MapLibre sets `position: relative` on its container, so the
          absolute positioning lives on a wrapper and the container fills it. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full bg-[#0e1116]" />
      </div>
      {mapStatus === "error" ? (
        <div role="alert" className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center">
          <div className="max-w-sm space-y-2">
            <p className="text-sm font-medium">The map could not start.</p>
            <p className="text-xs text-muted-foreground">{mapError}</p>
            <p className="text-xs text-muted-foreground">
              Check that WebGL is enabled and that tiles.openfreemap.org is reachable, then reload.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
