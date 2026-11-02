"use client";

import dynamic from "next/dynamic";

/**
 * MapLibre needs `window`, WebGL and Web Workers, so the map is loaded on the
 * client only. `ssr: false` must live in a Client Component (Next.js rule).
 * The placeholder fills the same box as the map so nothing shifts on load.
 */
const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});

export function MapPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0e1116]" aria-hidden>
      <span className="text-xs text-muted-foreground">Loading map…</span>
    </div>
  );
}

export function MapLoader() {
  return <MapView />;
}
