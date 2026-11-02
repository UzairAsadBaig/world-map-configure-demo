"use client";

import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { activeProvider } from "@/lib/radar/provider";
import { useAtmosStore, type LayerState } from "@/store/atmos-store";

function LayerRow({
  layer,
  title,
  description,
  badge,
  children,
}: {
  layer: keyof LayerState;
  title: string;
  description: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const id = useId();
  const visible = useAtmosStore((s) => s.layers[layer].visible);
  const setVisible = useAtmosStore((s) => s.setLayerVisible);
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
            {title}
            {badge}
          </label>
          <p id={`${id}-desc`} className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
        <Switch
          id={id}
          checked={visible}
          onCheckedChange={(v) => setVisible(layer, v)}
          aria-describedby={`${id}-desc`}
          className="mt-0.5"
        />
      </div>
      {children}
    </div>
  );
}

export function LayerPanel() {
  const opacity = useAtmosStore((s) => s.layers.radar.opacity);
  const radarVisible = useAtmosStore((s) => s.layers.radar.visible);
  const setOpacity = useAtmosStore((s) => s.setRadarOpacity);
  const opacityId = useId();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Layers
      </h2>
      <div className="divide-y">
        <LayerRow
          layer="radar"
          title="Radar imagery"
          badge={<Badge variant="outline" className="text-[10px]">Real data</Badge>}
          description={`Past ${activeProvider.limits.historyMinutes / 60} h of composite radar from ${activeProvider.name}, ~${activeProvider.limits.frameIntervalMinutes}-minute steps.`}
        >
          <div className="flex items-center gap-3 pl-0.5">
            <span id={opacityId} className="w-14 shrink-0 text-xs text-muted-foreground">
              Opacity
            </span>
            <Slider
              aria-labelledby={opacityId}
              value={[Math.round(opacity * 100)]}
              min={10}
              max={100}
              step={5}
              disabled={!radarVisible}
              onValueChange={(v) => setOpacity((Array.isArray(v) ? v[0] : v) / 100)}
              getAriaValueText={(_text, v) => `${v}%`}
            />
            <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums">
              {Math.round(opacity * 100)}%
            </span>
          </div>
        </LayerRow>
        <LayerRow
          layer="coverage"
          title="Radar coverage mask"
          badge={<Badge variant="outline" className="text-[10px]">Real data</Badge>}
          description={activeProvider.coverageDescription}
        />
        <LayerRow
          layer="annotations"
          title="Sample annotations"
          badge={
            <Badge variant="secondary" className="bg-violet-500/15 text-[10px] text-violet-200">
              Sample
            </Badge>
          }
          description="Hand-drawn example areas and points for testing vector layers. Not observations, forecasts or alerts. Click one for details."
        />
      </div>
    </section>
  );
}
