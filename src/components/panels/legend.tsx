"use client";

import { useId } from "react";
import { activeProvider } from "@/lib/radar/provider";
import type { PaletteStop } from "@/lib/radar/universal-blue-palette";

/** dBZ values that get a printed label. All exist as rows in the provider CSV. */
const LABELLED_DBZ = [0, 20, 40, 60];

function Ramp({ stops, pick, label }: { stops: readonly PaletteStop[]; pick: "rain" | "snow"; label: string }) {
  const first = stops[0].dbz;
  const last = stops[stops.length - 1].dbz;
  const pct = (dbz: number) => ((dbz - first) / (last - first)) * 100;
  // Hard-stop gradient: each documented stop is shown as a flat band, not interpolated.
  const bands = stops
    .map((s, i) => {
      const end = i < stops.length - 1 ? pct(stops[i + 1].dbz) : 100;
      // #rrggbbaa is valid CSS; alpha keeps faint low-dBZ colours faint.
      return `${s[pick]} ${pct(s.dbz)}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        role="img"
        aria-label={`${label} colour ramp from ${first} to ${last} ${activeProvider.legend.units}`}
        className="h-3 rounded-sm border border-white/10"
        style={{
          // Checkerboard under the ramp makes semi-transparent low values visible.
          backgroundImage: `linear-gradient(to right, ${bands}), repeating-conic-gradient(#2a2d35 0% 25%, #1b1d23 0% 50%)`,
          backgroundSize: "100% 100%, 8px 8px",
        }}
      />
    </div>
  );
}

export function Legend() {
  const { legend, name, timeSemantics, attribution, usageTerms } = activeProvider;
  const stops = legend.stops;
  const first = stops[0].dbz;
  const last = stops[stops.length - 1].dbz;
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Legend
      </h2>
      <p className="text-xs text-muted-foreground">
        Radar reflectivity, {legend.units} ({name} &ldquo;{legend.name}&rdquo; palette)
      </p>
      <Ramp stops={stops} pick="rain" label="Rain" />
      {legend.showsSnow ? <Ramp stops={stops} pick="snow" label="Snow" /> : null}
      <div className="relative h-4 font-mono text-[10px] text-muted-foreground" aria-hidden>
        {LABELLED_DBZ.map((d) => (
          <span
            key={d}
            className="absolute -translate-x-1/2"
            style={{ left: `${((d - first) / (last - first)) * 100}%` }}
          >
            {d}
          </span>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Colours follow the provider&apos;s published table ({first} to {last} {legend.units}). They
        show reflectivity, not rainfall amounts, and this app does not convert colours to values.
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">{timeSemantics}</p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Radar data:{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href={attribution.url} target="_blank" rel="noopener noreferrer">
          {attribution.label}
        </a>
        . {usageTerms} Basemap:{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">
          OpenFreeMap
        </a>{" "}
        ©{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">
          OpenMapTiles
        </a>{" "}
        Data from{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>
        .
      </p>
    </section>
  );
}
