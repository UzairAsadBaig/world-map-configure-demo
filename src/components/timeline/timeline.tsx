"use client";

import { ChevronLeft, ChevronRight, Loader2, Pause, Play, SkipForward } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PLAYBACK_SPEEDS,
  clampIndex,
  formatAge,
  formatUtcTime,
  indexOfKey,
  type PlaybackSpeedId,
} from "@/lib/radar/frames";
import { useNowSeconds } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { getSelectedFrame, useAtmosStore } from "@/store/atmos-store";

function IconButton({
  label,
  shortcut,
  onClick,
  disabled,
  children,
  pressed,
}: {
  label: string;
  shortcut?: string;
  onClick(): void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={label}
            aria-pressed={pressed}
            aria-keyshortcuts={shortcut}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-1.5 text-muted-foreground">({shortcut})</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function Timeline() {
  const frames = useAtmosStore((s) => s.catalog?.frames);
  const selection = useAtmosStore((s) => s.selection);
  const selected = useAtmosStore(getSelectedFrame);
  const displayed = useAtmosStore((s) => s.displayedFrame);
  const loadState = useAtmosStore((s) => s.frameLoadState);
  const isPlaying = useAtmosStore((s) => s.isPlaying);
  const speed = useAtmosStore((s) => s.speed);
  const radarVisible = useAtmosStore((s) => s.layers.radar.visible);
  const { selectFrame, stepFrame, goLatest, togglePlaying, setSpeed } = useAtmosStore.getState();
  const now = useNowSeconds();

  const list = frames ?? [];
  const count = list.length;
  const index = indexOfKey(list, selection.key);
  const latest = count ? list[count - 1] : null;
  const disabled = count === 0;

  // The label always describes the frame on screen. While a newer selection
  // loads, the old frame stays visible and its own time is shown, with a
  // "loading HH:MM" hint, so the timestamp never claims an undrawn frame.
  const shownFrame = radarVisible ? displayed : selected;
  const isLatestShown = !!shownFrame && shownFrame.key === latest?.key;
  const pending = radarVisible && !!selected && displayed?.key !== selected.key;

  // Keyboard shortcuts apply only while focus is inside the timeline region,
  // and never while the user is typing in a field.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    // Base UI's slider thumb focuses a hidden <input type="range">, so only
    // text-entry fields are excluded, not every input.
    const typing = t.closest(
      "textarea, select, [contenteditable='true'], input:not([type='range']):not([type='checkbox']):not([type='radio']):not([type='button'])",
    );
    if (typing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onSlider = t.matches("input[type='range'], [role='slider']");
    if (e.key === "k" || e.key === "K" || (e.key === " " && onSlider)) {
      e.preventDefault();
      togglePlaying();
    } else if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      goLatest();
    } else if ((e.key === "," || e.key === ".") && count) {
      e.preventDefault();
      stepFrame(e.key === "." ? 1 : -1);
    }
  };

  return (
    <div
      role="group"
      aria-label="Radar timeline"
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center lg:gap-4 lg:px-4"
    >
      <div className="flex items-center gap-0.5">
        <IconButton label="Previous frame" shortcut="," disabled={disabled} onClick={() => stepFrame(-1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </IconButton>
        <IconButton
          label={isPlaying ? "Pause" : "Play"}
          shortcut="K"
          pressed={isPlaying}
          disabled={count < 2}
          onClick={togglePlaying}
        >
          {isPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </IconButton>
        <IconButton label="Next frame" shortcut="." disabled={disabled} onClick={() => stepFrame(1)}>
          <ChevronRight className="size-4" aria-hidden />
        </IconButton>
        <Button
          variant={selection.followLatest && !isPlaying ? "secondary" : "outline"}
          size="sm"
          className="ml-1 h-8 gap-1 text-xs"
          aria-keyshortcuts="L"
          aria-pressed={selection.followLatest && !isPlaying}
          disabled={disabled}
          onClick={goLatest}
        >
          <SkipForward className="size-3.5" aria-hidden />
          Latest
        </Button>
        <ToggleGroup
          aria-label="Playback speed"
          className="ml-auto lg:ml-2"
          size="sm"
          spacing={0}
          variant="outline"
          value={[speed]}
          onValueChange={(v) => {
            if (v[0]) setSpeed(v[0] as PlaybackSpeedId);
          }}
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <ToggleGroupItem key={s.id} value={s.id} className="h-8 px-2 font-mono text-[11px]" aria-label={`Speed ${s.label}`}>
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <Slider
            aria-label="Radar frame"
            min={0}
            max={Math.max(count - 1, 1)}
            step={1}
            disabled={disabled}
            value={[Math.max(index, 0)]}
            // Scrubbing pauses playback (selectFrame pauses). Only the final
            // target is ever swapped in by the frame manager, so fast drags
            // cannot leave an obsolete frame on screen.
            onValueChange={(v) => {
              const i = clampIndex(Array.isArray(v) ? v[0] : v, count);
              if (i >= 0 && list[i].key !== selection.key) selectFrame(list[i].key);
            }}
            getAriaValueText={(_text, i) =>
              list[i] ? `${formatUtcTime(list[i].time)} UTC${i === count - 1 ? ", latest" : ""}` : ""
            }
          />
          <div className="relative mt-1 h-3.5 font-mono text-[10px] text-muted-foreground" aria-hidden>
            {list.map((f, i) =>
              i % 3 === 0 || i === count - 1 ? (
                <span
                  key={f.key}
                  className={cn(
                    "absolute -translate-x-1/2 tabular-nums",
                    i === 0 && "translate-x-0",
                    i === count - 1 && "-translate-x-full text-emerald-300",
                    i !== count - 1 && i > count - 3 && "hidden",
                    // Phones: only every sixth tick, plus first and last.
                    i !== count - 1 && i % 6 !== 0 && "max-sm:hidden",
                    i !== count - 1 && i > count - 5 && "max-sm:hidden",
                  )}
                  style={{ left: `${count > 1 ? (i / (count - 1)) * 100 : 0}%` }}
                >
                  {formatUtcTime(f.time)}
                </span>
              ) : null,
            )}
          </div>
        </div>

        <div className="w-[9.5rem] shrink-0 text-right" aria-live="polite" aria-atomic="true">
          {shownFrame ? (
            <>
              <div className="flex items-center justify-end gap-1.5">
                <span
                  className={cn(
                    "rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide",
                    isLatestShown ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200",
                  )}
                >
                  {isLatestShown ? "Latest" : "Historical"}
                </span>
                <span className="font-mono text-sm tabular-nums">{formatUtcTime(shownFrame.time)} UTC</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {pending || loadState === "rate-limited" ? (
                  <span className="inline-flex items-center gap-1 text-amber-200">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    {loadState === "rate-limited"
                      ? "Waiting for request budget"
                      : `Loading ${formatUtcTime(selected!.time)}`}
                  </span>
                ) : now > 0 ? (
                  <>Generated {formatAge(shownFrame.time, now)}</>
                ) : (
                  <>Frame generation time</>
                )}
              </div>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {disabled ? "No frames yet" : radarVisible ? "Loading radar…" : "Radar hidden"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
