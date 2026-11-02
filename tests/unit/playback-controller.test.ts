import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackController, type PlaybackSnapshot } from "@/lib/playback/playback-controller";
import { makeFrames } from "./fixtures";

function setup(initial: Partial<PlaybackSnapshot> = {}) {
  const frames = makeFrames(4);
  const snap: PlaybackSnapshot = {
    isPlaying: true,
    speed: "normal",
    frames,
    selectedKey: frames[0].key,
    displayedKey: frames[0].key,
    radarVisible: true,
    ...initial,
  };
  let hidden = false;
  const preloaded: string[] = [];
  const ctl = new PlaybackController({
    getSnapshot: () => snap,
    advance: () => {
      const i = frames.findIndex((f) => f.key === snap.selectedKey);
      snap.selectedKey = frames[(i + 1) % frames.length].key;
    },
    preload: (f) => f && preloaded.push(f.key),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    isDocumentHidden: () => hidden,
  });
  return { ctl, snap, frames, preloaded, setHidden: (h: boolean) => (hidden = h) };
}

describe("PlaybackController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("advances after the dwell time once the frame is displayed", () => {
    const { ctl, snap, frames, preloaded } = setup();
    ctl.sync();
    expect(preloaded).toEqual([frames[1].key]); // conservative: next frame only
    vi.advanceTimersByTime(699);
    expect(snap.selectedKey).toBe(frames[0].key);
    vi.advanceTimersByTime(1);
    expect(snap.selectedKey).toBe(frames[1].key);
  });

  it("waits (buffers) while the selected frame is not drawn yet", () => {
    const { ctl, snap, frames } = setup();
    snap.selectedKey = frames[1].key; // selected but still loading
    ctl.sync();
    vi.advanceTimersByTime(10_000);
    expect(snap.selectedKey).toBe(frames[1].key);
    snap.displayedKey = frames[1].key; // frame manager reports it drawn
    ctl.sync();
    vi.advanceTimersByTime(700);
    expect(snap.selectedKey).toBe(frames[2].key);
  });

  it("loops from the last frame to the first after a longer hold", () => {
    const { ctl, snap, frames } = setup();
    snap.selectedKey = snap.displayedKey = frames[3].key;
    ctl.sync();
    vi.advanceTimersByTime(700);
    expect(snap.selectedKey).toBe(frames[3].key); // latest is held longer
    vi.advanceTimersByTime(1100);
    expect(snap.selectedKey).toBe(frames[0].key);
  });

  it("does no timer work in a hidden tab", () => {
    const { ctl, snap, frames, setHidden } = setup();
    setHidden(true);
    ctl.sync();
    expect(vi.getTimerCount()).toBe(0);
    setHidden(false);
    ctl.sync();
    vi.advanceTimersByTime(700);
    expect(snap.selectedKey).toBe(frames[1].key);
  });

  it("stops when paused and keeps exactly one timer", () => {
    const { ctl, snap, frames } = setup();
    ctl.sync();
    ctl.sync();
    expect(vi.getTimerCount()).toBe(1);
    snap.isPlaying = false;
    ctl.sync();
    vi.advanceTimersByTime(5000);
    expect(snap.selectedKey).toBe(frames[0].key);
  });
});
