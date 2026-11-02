import type { RadarFrame } from "./types";

/** Ascending by time; later duplicates of the same key are dropped. */
export function sortFrames(frames: readonly RadarFrame[]): RadarFrame[] {
  const seen = new Set<string>();
  return [...frames]
    .sort((a, b) => a.time - b.time)
    .filter((f) => {
      if (seen.has(f.key)) return false;
      seen.add(f.key);
      return true;
    });
}

/**
 * What the user asked to look at. `followLatest` means "always the newest
 * frame", so a refresh that brings a new frame advances the view. Otherwise
 * `key` pins a specific historical frame.
 */
export interface FrameSelection {
  followLatest: boolean;
  key: string | null;
}

export interface ReconcileResult {
  selection: FrameSelection;
  /** Set when the pinned frame disappeared and a replacement was chosen. */
  notice: string | null;
}

/**
 * Maps a selection onto a freshly fetched frame list.
 * - Following latest: jump to the newest frame.
 * - Pinned and still present: keep it.
 * - Pinned but expired (rolled out of the 2-hour window): choose the nearest
 *   remaining frame in time and explain the change.
 */
export function reconcileSelection(
  frames: readonly RadarFrame[],
  selection: FrameSelection,
  previousFrames: readonly RadarFrame[] = [],
): ReconcileResult {
  if (frames.length === 0) {
    return { selection: { ...selection }, notice: null };
  }
  const latest = frames[frames.length - 1];
  if (selection.followLatest || selection.key === null) {
    return { selection: { followLatest: true, key: latest.key }, notice: null };
  }
  if (frames.some((f) => f.key === selection.key)) {
    return { selection: { ...selection }, notice: null };
  }
  const expired = previousFrames.find((f) => f.key === selection.key);
  const replacement = expired ? nearestFrame(frames, expired.time) : frames[0];
  const notice = expired
    ? `The ${formatUtcTime(expired.time)} UTC frame is no longer offered by the provider. Showing ${formatUtcTime(replacement.time)} UTC instead.`
    : `The selected frame is no longer offered by the provider. Showing ${formatUtcTime(replacement.time)} UTC instead.`;
  return {
    selection: {
      followLatest: replacement.key === latest.key,
      key: replacement.key,
    },
    notice,
  };
}

export function nearestFrame(frames: readonly RadarFrame[], time: number): RadarFrame {
  let best = frames[0];
  for (const f of frames) {
    if (Math.abs(f.time - time) < Math.abs(best.time - time)) best = f;
  }
  return best;
}

export function indexOfKey(frames: readonly RadarFrame[], key: string | null): number {
  if (key === null) return -1;
  return frames.findIndex((f) => f.key === key);
}

/** Next frame index, wrapping to the start after the last frame. */
export function nextIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  if (index < 0 || index >= count - 1) return 0;
  return index + 1;
}

/** Previous frame index, wrapping to the end before the first frame. */
export function prevIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  if (index <= 0 || index >= count) return count - 1;
  return index - 1;
}

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  return Math.min(Math.max(Math.round(index), 0), count - 1);
}

export const PLAYBACK_SPEEDS = [
  { id: "slow", label: "0.5×", frameMs: 1200 },
  { id: "normal", label: "1×", frameMs: 700 },
  { id: "fast", label: "2×", frameMs: 400 },
] as const;
export type PlaybackSpeedId = (typeof PLAYBACK_SPEEDS)[number]["id"];

/**
 * How long a frame stays on screen during playback. The newest frame is held
 * longer so the loop has a visible "end" before wrapping to the oldest frame.
 */
export function frameDwellMs(index: number, count: number, speed: PlaybackSpeedId): number {
  const base = PLAYBACK_SPEEDS.find((s) => s.id === speed)?.frameMs ?? 700;
  return index === count - 1 ? base * 2.5 : base;
}

export function formatUtcTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function formatUtcDateTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const date = d.toISOString().slice(0, 10);
  return `${date} ${formatUtcTime(unixSeconds)} UTC`;
}

/** "42 min ago" style offset relative to `nowSeconds`. */
export function formatAge(unixSeconds: number, nowSeconds: number): string {
  const mins = Math.round((nowSeconds - unixSeconds) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h ago` : `${h} h ${m} min ago`;
}
