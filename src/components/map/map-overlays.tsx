"use client";

import { AlertTriangle, Info, Loader2, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activeProvider } from "@/lib/radar/provider";
import { useRadarCatalogStatus } from "@/lib/radar/use-radar-catalog";
import { useAtmosStore } from "@/store/atmos-store";
import { cn } from "@/lib/utils";

function Pill({ tone, children, onDismiss }: { tone: "info" | "warn" | "error"; children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs shadow-md backdrop-blur",
        tone === "info" && "border-white/10 bg-card/90 text-foreground",
        tone === "warn" && "border-amber-400/30 bg-amber-950/80 text-amber-100",
        tone === "error" && "border-red-400/30 bg-red-950/85 text-red-100",
      )}
    >
      {children}
      {onDismiss ? (
        <Button variant="ghost" size="icon-xs" className="-my-0.5 -mr-1 ml-auto shrink-0" aria-label="Dismiss" onClick={onDismiss}>
          <X className="size-3" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Status messages over the map, placed bottom-centre so they never cover the
 * zoom controls (top-right), scale (bottom-left) or attribution (bottom-right).
 */
export function MapOverlays() {
  const { data, error: finalError, failureReason } = useRadarCatalogStatus();
  const error = finalError ?? failureReason; // see DataStatus
  const loadState = useAtmosStore((s) => s.frameLoadState);
  const tileErrors = useAtmosStore((s) => s.tileErrorCount);
  const notice = useAtmosStore((s) => s.notice);
  const dismissNotice = useAtmosStore((s) => s.dismissNotice);
  const zoom = useAtmosStore((s) => s.mapZoom);
  const radarVisible = useAtmosStore((s) => s.layers.radar.visible);
  const mapReady = useAtmosStore((s) => s.mapStatus === "ready");
  const basemapError = useAtmosStore((s) => s.basemapError);
  const frameCount = data?.frames.length ?? 0;
  const maxZ = activeProvider.limits.maxNativeZoom;

  const items: React.ReactNode[] = [];

  if (!data && error) {
    items.push(
      <Pill key="meta" tone="error">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Radar data request failed: {error?.message} The basemap is still usable; retrying with backoff.
        </span>
      </Pill>,
    );
  } else if (data && frameCount === 0) {
    items.push(
      <Pill key="empty" tone="warn">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>The provider currently lists no historical radar frames.</span>
      </Pill>,
    );
  }

  if (mapReady && radarVisible && frameCount > 0) {
    if (loadState === "loading") {
      items.push(
        <Pill key="load" tone="info">
          <Loader2 className="mt-px size-3.5 shrink-0 animate-spin" aria-hidden />
          <span>Loading radar tiles…</span>
        </Pill>,
      );
    } else if (loadState === "rate-limited") {
      items.push(
        <Pill key="rate" tone="warn">
          <Loader2 className="mt-px size-3.5 shrink-0 animate-spin" aria-hidden />
          <span>
            Pausing new radar requests to stay within the provider&apos;s limit. The current frame stays on screen.
          </span>
        </Pill>,
      );
    }
    if (tileErrors > 0) {
      items.push(
        <Pill key="tiles" tone="warn">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            {tileErrors} radar tile{tileErrors === 1 ? "" : "s"} failed to load for this frame. Gaps may be missing data.
          </span>
        </Pill>,
      );
    }
    if (zoom > maxZ + 1) {
      items.push(
        <Pill key="zoom" tone="info">
          <ZoomIn className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Radar tiles stop at zoom {maxZ}; zooming further enlarges pixels, not detail.</span>
        </Pill>,
      );
    }
  }

  if (basemapError) {
    items.push(
      <Pill key="base" tone="warn">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>Some basemap tiles failed to load.</span>
      </Pill>,
    );
  }

  if (notice) {
    items.push(
      <Pill key="notice" tone="info" onDismiss={dismissNotice}>
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>{notice}</span>
      </Pill>,
    );
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-9 z-10 flex flex-col items-center gap-1.5 px-14"
    >
      {items}
    </div>
  );
}
