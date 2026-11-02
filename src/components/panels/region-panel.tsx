"use client";

import { useId } from "react";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REGIONS } from "@/lib/map/regions";
import { useAtmosStore } from "@/store/atmos-store";

export function RegionPanel() {
  const regionId = useAtmosStore((s) => s.regionId);
  const selectRegion = useAtmosStore((s) => s.selectRegion);
  const resetView = useAtmosStore((s) => s.resetView);
  const setMobilePanelOpen = useAtmosStore((s) => s.setMobilePanelOpen);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Region
      </h2>
      <div role="group" aria-labelledby={headingId} className="grid grid-cols-3 gap-1.5">
        {REGIONS.map((r) => (
          <Button
            key={r.id}
            variant={r.id === regionId ? "secondary" : "outline"}
            size="sm"
            aria-pressed={r.id === regionId}
            className="h-9 px-2 text-xs"
            onClick={() => {
              selectRegion(r.id);
              setMobilePanelOpen(false);
            }}
          >
            <span aria-hidden>{r.shortLabel}</span>
            <span className="sr-only">{r.label}</span>
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start gap-2 text-xs text-muted-foreground"
        onClick={() => {
          resetView();
          setMobilePanelOpen(false);
        }}
      >
        <LocateFixed className="size-3.5" aria-hidden />
        Reset view to {REGIONS.find((r) => r.id === regionId)?.label}
      </Button>
    </section>
  );
}
