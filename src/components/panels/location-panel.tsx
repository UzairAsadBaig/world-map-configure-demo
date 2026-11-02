"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { samplePixel } from "@/lib/map/point-sampler";
import { sourceTileZoom } from "@/lib/map/tiles";
import { providerBudget } from "@/lib/net/request-budget";
import { formatUtcDateTime } from "@/lib/radar/frames";
import { activeProvider } from "@/lib/radar/provider";
import { useAtmosStore } from "@/store/atmos-store";

function formatCoord(value: number, pos: string, neg: string) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? pos : neg}`;
}

/**
 * Qualitative radar state at the clicked point. Distinguishes request failure,
 * outside coverage, "nothing drawn here", and "echo drawn here". It never
 * reports a value: colours are not converted back to dBZ or rain rate.
 */
function PointRadarState() {
  const clicked = useAtmosStore((s) => s.clicked);
  const frame = useAtmosStore((s) => s.displayedFrame);
  const isPlaying = useAtmosStore((s) => s.isPlaying);
  const radarVisible = useAtmosStore((s) => s.layers.radar.visible);
  const p = activeProvider;
  const tileZ = clicked ? sourceTileZoom(clicked.zoom, p.tileSize, p.limits.maxNativeZoom) : 0;
  // Sampling during playback would cost two requests per frame; wait for pause.
  const enabled = !!clicked && !!frame && radarVisible && !isPlaying;

  const coverage = useQuery({
    queryKey: ["coverage-sample", clicked?.lng, clicked?.lat, tileZ],
    enabled: !!clicked && !!p.coverageTileUrl,
    queryFn: ({ signal }) =>
      samplePixel(p.coverageTileUrl!, clicked!.lng, clicked!.lat, clicked!.zoom, p.tileSize, p.limits.maxNativeZoom, providerBudget, signal),
    staleTime: Infinity,
    retry: 1,
  });
  const radar = useQuery({
    queryKey: ["radar-sample", frame?.key, clicked?.lng, clicked?.lat, tileZ],
    enabled,
    queryFn: ({ signal }) =>
      samplePixel(frame!.tileUrl, clicked!.lng, clicked!.lat, clicked!.zoom, p.tileSize, p.limits.maxNativeZoom, providerBudget, signal),
    staleTime: Infinity,
    retry: 1,
  });

  if (!radarVisible) return <p className="text-muted-foreground">Radar layer is off.</p>;
  if (isPlaying) return <p className="text-muted-foreground">Pause playback to check radar at this point.</p>;
  if (!frame) return <p className="text-muted-foreground">Waiting for a radar frame…</p>;
  if (coverage.isPending || radar.isPending) return <p className="text-muted-foreground">Checking radar at this point…</p>;
  if (coverage.isError || radar.isError) {
    return <p className="text-red-300">Could not read radar tiles for this point (request failed).</p>;
  }
  // Documented mask semantics: black/opaque = no radar coverage.
  if (coverage.data && coverage.data.a > 128) {
    return (
      <p className="text-amber-200">
        Outside radar coverage. No colour here means no data, not dry weather.
      </p>
    );
  }
  const px = radar.data;
  if (px && px.a > 0) {
    return (
      <p className="flex items-center gap-2">
        <span
          className="inline-block size-3 shrink-0 rounded-sm border border-white/20"
          style={{ backgroundColor: `rgba(${px.r},${px.g},${px.b},${px.a / 255})` }}
          aria-hidden
        />
        Radar echo drawn at this point. See the legend for the colour scale.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      Inside coverage, no echo drawn at this point in this frame. A blank pixel does not prove there is
      no precipitation (beam height, gaps and display thresholds all matter).
    </p>
  );
}

export function LocationPanel() {
  const clicked = useAtmosStore((s) => s.clicked);
  const feature = useAtmosStore((s) => s.selectedFeature);
  const frame = useAtmosStore((s) => s.displayedFrame);
  const latestKey = useAtmosStore((s) => s.catalog?.frames.at(-1)?.key ?? null);
  const layers = useAtmosStore((s) => s.layers);
  const setClicked = useAtmosStore((s) => s.setClicked);
  const setFeature = useAtmosStore((s) => s.setSelectedFeature);

  if (!clicked) return null;

  const active = [
    layers.radar.visible && "Radar imagery",
    layers.coverage.visible && "Coverage mask",
    layers.annotations.visible && "Sample annotations",
  ].filter(Boolean) as string[];

  return (
    <section
      aria-label="Selected location details"
      className="absolute top-2 left-2 z-10 w-[min(20rem,calc(100%-4rem))] rounded-lg border bg-card/95 text-xs shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <MapPin className="size-3.5 text-sky-300" aria-hidden />
        <h2 className="text-xs font-semibold">Selected location</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Close location details"
          onClick={() => {
            setClicked(null);
            setFeature(null);
          }}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-3 py-2">
        <dt className="text-muted-foreground">Coordinates</dt>
        <dd className="font-mono tabular-nums">
          {formatCoord(clicked.lat, "N", "S")}, {formatCoord(clicked.lng, "E", "W")}
        </dd>
        <dt className="text-muted-foreground">Frame</dt>
        <dd className="font-mono tabular-nums">
          {frame ? (
            <>
              {formatUtcDateTime(frame.time)}{" "}
              <span className="font-sans text-muted-foreground">
                ({frame.key === latestKey ? "latest" : "historical"})
              </span>
            </>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-muted-foreground">Layers on</dt>
        <dd>{active.length ? active.join(", ") : "None"}</dd>
        <dt className="text-muted-foreground">Radar</dt>
        <dd>
          <PointRadarState />
        </dd>
      </dl>
      {feature ? (
        <div className="space-y-1 border-t px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{feature.title}</span>
            <Badge variant="secondary" className="bg-violet-500/15 text-[10px] text-violet-200">
              Sample
            </Badge>
          </div>
          <p className="text-muted-foreground">{feature.note}</p>
          <p className="text-[11px] text-violet-200/80">
            Sample annotation for this prototype: not an observation, forecast or official alert.
          </p>
        </div>
      ) : null}
    </section>
  );
}
