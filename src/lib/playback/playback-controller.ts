import { frameDwellMs, indexOfKey, type PlaybackSpeedId } from "@/lib/radar/frames";
import type { RadarFrame } from "@/lib/radar/types";

/**
 * Drives radar animation with plain timers, outside React.
 *
 * Playback is *display-paced*: the next frame is only selected after the
 * current selection has actually been drawn and has stayed on screen for its
 * dwell time. If a frame is still loading (or waiting for request budget) the
 * loop simply waits, which is what the UI shows as "buffering". This keeps the
 * animation honest under a tight request budget instead of promising a frame
 * rate the network cannot sustain.
 */

export interface PlaybackSnapshot {
  isPlaying: boolean;
  speed: PlaybackSpeedId;
  frames: readonly RadarFrame[];
  selectedKey: string | null;
  displayedKey: string | null;
  radarVisible: boolean;
}

export interface PlaybackDeps {
  getSnapshot(): PlaybackSnapshot;
  advance(): void;
  /** Called with the frame after the displayed one, for conservative preloading. */
  preload(frame: RadarFrame | null): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  isDocumentHidden(): boolean;
}

export class PlaybackController {
  private timer: unknown = null;

  constructor(private readonly deps: PlaybackDeps) {}

  /**
   * Re-evaluate after any relevant change (play/pause, speed, displayed frame,
   * tab visibility). Idempotent: it cancels and re-arms the single timer.
   */
  sync() {
    this.cancel();
    const s = this.deps.getSnapshot();
    if (!s.isPlaying || s.frames.length < 2) return;
    // Hidden tabs: no timers at all; resumes on visibilitychange.
    if (this.deps.isDocumentHidden()) return;
    // When radar is hidden nothing is drawn, so pace by selection instead.
    const shown = s.radarVisible ? s.displayedKey : s.selectedKey;
    if (shown !== s.selectedKey) return; // buffering: wait for the frame to draw
    const i = indexOfKey(s.frames, s.selectedKey);
    if (s.radarVisible) this.deps.preload(s.frames[(i + 1) % s.frames.length] ?? null);
    this.timer = this.deps.setTimeout(() => {
      this.timer = null;
      const now = this.deps.getSnapshot();
      if (!now.isPlaying || this.deps.isDocumentHidden()) return;
      this.deps.advance();
      // If the advanced frame is already cached and drawn synchronously, the
      // displayed-key subscription will call sync() again; otherwise we wait.
    }, frameDwellMs(i, s.frames.length, s.speed));
  }

  cancel() {
    if (this.timer !== null) this.deps.clearTimeout(this.timer);
    this.timer = null;
  }
}
