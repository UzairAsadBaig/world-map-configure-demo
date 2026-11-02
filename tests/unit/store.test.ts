import { describe, expect, it } from "vitest";
import { createAtmosStore } from "@/store/atmos-store";
import { makeCatalog, makeFrames } from "./fixtures";

describe("atmos store: selection and playback state", () => {
  it("starts on the latest frame", () => {
    const store = createAtmosStore();
    const frames = makeFrames(13);
    store.getState().setCatalog(makeCatalog(frames));
    expect(store.getState().selection).toEqual({ followLatest: true, key: frames[12].key });
  });

  it("rapid scrubbing pauses playback and ends on the last requested frame", () => {
    const store = createAtmosStore();
    const frames = makeFrames(13);
    store.getState().setCatalog(makeCatalog(frames));
    store.getState().setPlaying(true);
    for (const i of [11, 4, 9, 0, 7, 2]) store.getState().selectFrame(frames[i].key);
    const s = store.getState();
    expect(s.isPlaying).toBe(false);
    expect(s.selection.key).toBe(frames[2].key);
    expect(s.selection.followLatest).toBe(false);
  });

  it("playback loops from the latest frame back to the oldest", () => {
    const store = createAtmosStore();
    const frames = makeFrames(3);
    store.getState().setCatalog(makeCatalog(frames));
    store.getState().setPlaying(true);
    store.getState().playbackAdvance();
    expect(store.getState().selection.key).toBe(frames[0].key);
    store.getState().playbackAdvance();
    expect(store.getState().selection.key).toBe(frames[1].key);
    expect(store.getState().isPlaying).toBe(true);
  });

  it("cannot play with fewer than two frames", () => {
    const store = createAtmosStore();
    store.getState().setCatalog(makeCatalog(makeFrames(1)));
    store.getState().setPlaying(true);
    expect(store.getState().isPlaying).toBe(false);
  });

  it("'Latest' pauses and resumes following new frames", () => {
    const store = createAtmosStore();
    const frames = makeFrames(13);
    store.getState().setCatalog(makeCatalog(frames));
    store.getState().selectFrame(frames[3].key);
    store.getState().goLatest();
    const next = makeFrames(13, frames[1].time);
    store.getState().setCatalog(makeCatalog(next));
    expect(store.getState().selection.key).toBe(next[12].key);
  });

  it("keeps a pinned frame across refreshes and replaces it once expired", () => {
    const store = createAtmosStore();
    const v1 = makeFrames(13);
    store.getState().setCatalog(makeCatalog(v1));
    store.getState().selectFrame(v1[1].key);

    const v2 = makeFrames(13, v1[1].time); // v1[0] expired, v1[1] still present
    store.getState().setCatalog(makeCatalog(v2));
    expect(store.getState().selection.key).toBe(v1[1].key);
    expect(store.getState().notice).toBeNull();

    const v3 = makeFrames(13, v1[2].time); // now v1[1] expired too
    store.getState().setCatalog(makeCatalog(v3));
    expect(store.getState().selection.key).toBe(v3[0].key);
    expect(store.getState().notice).toMatch(/no longer offered/);
  });

  it("preserves layer, opacity and region choices across refreshes", () => {
    const store = createAtmosStore();
    store.getState().setCatalog(makeCatalog(makeFrames(13)));
    store.getState().setRadarOpacity(0.4);
    store.getState().setLayerVisible("coverage", true);
    store.getState().selectRegion("uk");
    store.getState().setCatalog(makeCatalog(makeFrames(13, 1_800_000_600)));
    const s = store.getState();
    expect(s.layers.radar.opacity).toBe(0.4);
    expect(s.layers.coverage.visible).toBe(true);
    expect(s.regionId).toBe("uk");
  });

  it("step buttons wrap and pause playback", () => {
    const store = createAtmosStore();
    const frames = makeFrames(4);
    store.getState().setCatalog(makeCatalog(frames));
    store.getState().setPlaying(true);
    store.getState().stepFrame(1); // from latest wraps to oldest
    expect(store.getState().selection.key).toBe(frames[0].key);
    expect(store.getState().isPlaying).toBe(false);
    store.getState().stepFrame(-1);
    expect(store.getState().selection).toEqual({ key: frames[3].key, followLatest: true });
  });
});
