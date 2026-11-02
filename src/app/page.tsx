import { CloudRain } from "lucide-react";
import { Providers } from "@/components/providers";
import { RadarDataSync } from "@/components/radar-data-sync";
import { DataStatus } from "@/components/header/data-status";
import { RefreshButton } from "@/components/header/refresh-button";
import { MobilePanelTrigger } from "@/components/panels/mobile-panel";
import { SidePanel } from "@/components/panels/side-panel";
import { MapLoader } from "@/components/map/map-loader";
import { MapOverlays } from "@/components/map/map-overlays";
import { LocationPanel } from "@/components/panels/location-panel";
import { Timeline } from "@/components/timeline/timeline";

/**
 * Server Component shell. Static structure renders on the server (or at build
 * time for a static export); interactive islands are Client Components.
 */
export default function Home() {
  return (
    <Providers>
      <RadarDataSync />
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-background text-foreground md:grid-cols-[300px_minmax(0,1fr)]">
        <header className="col-span-full flex h-12 items-center gap-2 border-b px-3 md:px-4">
          <CloudRain className="size-5 shrink-0 text-sky-400" aria-hidden />
          <h1 className="min-w-0 shrink-0 text-sm font-semibold tracking-tight">
            Atmos <span className="hidden font-normal text-muted-foreground sm:inline">— Weather Map</span>
          </h1>
          <span className="ml-1 hidden rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
            Learning prototype
          </span>
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <DataStatus />
            <RefreshButton />
            <MobilePanelTrigger />
          </div>
        </header>

        <aside
          aria-label="Layers, regions and legend"
          className="hidden min-h-0 overflow-y-auto border-r md:block"
        >
          <SidePanel />
        </aside>

        <main className="relative min-h-0 min-w-0" aria-label="Weather map">
          <MapLoader />
          <MapOverlays />
          <LocationPanel />
        </main>

        <footer className="col-span-full border-t md:col-start-2 md:col-span-1">
          <Timeline />
        </footer>
      </div>
    </Providers>
  );
}
