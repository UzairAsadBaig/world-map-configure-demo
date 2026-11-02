import { expect, test } from "@playwright/test";
import {
  collectConsoleProblems,
  frameSlider,
  shownLabel,
  storeState,
  timeline,
  useTileCache,
  waitForRadar,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await useTileCache(page);
});

test("loads the basemap and the latest real radar frame without console errors", async ({ page }) => {
  const problems = collectConsoleProblems(page);
  const radarTiles: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("tilecache.rainviewer.com/v2/radar/")) radarTiles.push(r.url());
  });
  await page.goto("/?e2e=1");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await waitForRadar(page);

  await expect(timeline(page).locator("[aria-live]")).toContainText("Latest");
  const { displayed, latest } = await storeState<{ displayed: string; latest: string }>(
    page,
    "({ displayed: s.displayedFrame.key, latest: s.catalog.frames.at(-1).key })",
  );
  expect(displayed).toBe(latest);
  expect(radarTiles.length).toBeGreaterThan(0);
  // Only native zooms are requested (provider max 7) at 512 px.
  for (const u of radarTiles) expect(u).toMatch(/\/512\/[0-7]\/\d+\/\d+\/2\/1_1\.png$/);
  await expect(page.getByRole("status").first()).toContainText(/Radar list \d\d:\d\d UTC/);
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("OpenStreetMap");
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("RainViewer");
  expect(problems).toEqual([]);
});

test("plays, pauses, and the label always matches the drawn frame", async ({ page }) => {
  await page.goto("/?e2e=1");
  await waitForRadar(page);
  await timeline(page).getByRole("button", { name: "Play" }).click();
  await expect(timeline(page).getByRole("button", { name: "Pause" })).toBeVisible();
  // Wrapping from latest to oldest frame shows a historical frame.
  await expect(timeline(page).locator("[aria-live]")).toContainText("Historical", { timeout: 30_000 });
  // Sample a few times: the shown time must equal the displayed frame's time.
  for (let i = 0; i < 4; i++) {
    const { label, time } = await page.evaluate(() => {
      const w = window as unknown as { __atmos: { store: { getState(): { displayedFrame: { time: number } } } } };
      const t = w.__atmos.store.getState().displayedFrame.time;
      const d = new Date(t * 1000);
      return {
        time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`,
        label: document.querySelector('[aria-label="Radar timeline"] [aria-live]')!.textContent ?? "",
      };
    });
    expect(label).toContain(time);
    await page.waitForTimeout(600);
  }
  await timeline(page).getByRole("button", { name: "Pause" }).click();
  expect(await storeState<boolean>(page, "s.isPlaying")).toBe(false);
});

test("rapid keyboard scrubbing pauses playback and settles on the final frame", async ({ page }) => {
  await page.goto("/?e2e=1");
  await waitForRadar(page);
  await timeline(page).getByRole("button", { name: "Play" }).click();
  const slider = frameSlider(page);
  await slider.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  expect(await storeState<boolean>(page, "s.isPlaying")).toBe(false);
  const expected = await storeState<string>(page, "s.catalog.frames[5].key");
  await expect
    .poll(() => storeState<string | null>(page, "s.displayedFrame && s.displayedFrame.key"), { timeout: 30_000 })
    .toBe(expected);
  const valueText = await slider.getAttribute("aria-valuetext");
  expect(await shownLabel(page)).toContain(valueText!.replace(", latest", ""));
  await expect(timeline(page).locator("[aria-live]")).toContainText("Historical");

  // Keyboard shortcuts while the slider is focused.
  await page.keyboard.press("l");
  expect(await storeState<boolean>(page, "s.selection.followLatest")).toBe(true);
  // Scrubbing through uncached frames may have used the request budget, so
  // the latest frame can legitimately be waiting. Either way the label must
  // describe what is drawn: "Latest" only once the latest frame is displayed.
  await expect(timeline(page).locator("[aria-live]")).toContainText(
    /Latest|Waiting for request budget|Loading \d\d:\d\d/,
  );
  const shownIsLatest = await storeState<boolean>(
    page,
    "s.displayedFrame.key === s.catalog.frames.at(-1).key",
  );
  if (!shownIsLatest) await expect(timeline(page).locator("[aria-live]")).toContainText("Historical");
  await page.keyboard.press("k");
  expect(await storeState<boolean>(page, "s.isPlaying")).toBe(true);
  await page.keyboard.press("k");
  expect(await storeState<boolean>(page, "s.isPlaying")).toBe(false);
});

test("layer visibility and opacity reach the map", async ({ page }) => {
  await page.goto("/?e2e=1");
  await waitForRadar(page);
  const radarLayers = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __atmos: { map: { getStyle(): { layers: { id: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }[] } } };
      };
      return w.__atmos.map
        .getStyle()
        .layers.filter((l) => l.id.startsWith("radar-frame-"))
        .map((l) => ({ vis: l.layout?.visibility ?? "visible", op: l.paint?.["raster-opacity"] as number }));
    });
  const layoutOf = (id: string) =>
    page.evaluate((lid) => {
      const w = window as unknown as { __atmos: { map: { getLayoutProperty(id: string, p: string): unknown } } };
      return w.__atmos.map.getLayoutProperty(lid, "visibility") ?? "visible";
    }, id);

  // Radar toggle
  await page.getByRole("switch", { name: /Radar imagery/ }).click();
  expect((await radarLayers()).every((l) => l.vis === "none")).toBe(true);
  await page.getByRole("switch", { name: /Radar imagery/ }).click();
  expect((await radarLayers()).some((l) => l.vis === "visible" && l.op > 0)).toBe(true);

  // Opacity slider (keyboard)
  const opacity = page.getByRole("slider", { name: "Opacity" });
  await opacity.focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => Math.max(...(await radarLayers()).map((l) => l.op))).toBeCloseTo(0.1, 2);

  // Coverage mask
  expect(await layoutOf("radar-coverage")).toBe("none");
  await page.getByRole("switch", { name: /Radar coverage mask/ }).click();
  expect(await layoutOf("radar-coverage")).toBe("visible");

  // Sample annotations
  await page.getByRole("switch", { name: /Sample annotations/ }).click();
  expect(await layoutOf("sample-annotations-fill")).toBe("none");
});

test("clicking a sample annotation shows labelled sample details and coordinates", async ({ page }) => {
  await page.goto("/?e2e=1");
  await waitForRadar(page);
  // Project the Chicago sample point to screen coordinates and click it.
  const pt = await page.evaluate(() => {
    const w = window as unknown as { __atmos: { map: { project(ll: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } } };
    const p = w.__atmos.map.project([-87.6298, 41.8781]);
    const r = w.__atmos.map.getContainer().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(pt.x, pt.y);
  const panel = page.getByRole("region", { name: "Selected location details" });
  await expect(panel).toContainText("Chicago (sample point)");
  await expect(panel).toContainText("not an observation, forecast or official alert");
  await expect(panel).toContainText(/41\.\d{4}° N, 87\.\d{4}° W/);
  // Qualitative point state resolves (one of the documented outcomes).
  await expect(panel).toContainText(/Outside radar coverage|no echo drawn|Radar echo drawn|request failed/);
  await panel.getByRole("button", { name: "Close location details" }).click();
  await expect(panel).toHaveCount(0);
});

test("changing region during playback moves the map and keeps playing", async ({ page }) => {
  await page.goto("/?e2e=1");
  await waitForRadar(page);
  await timeline(page).getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: /Europe/ }).click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as { __atmos: { map: { getCenter(): { lng: number; lat: number } } } };
          return w.__atmos.map.getCenter().lng;
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(-5);
  expect(await storeState<boolean>(page, "s.isPlaying")).toBe(true);
  expect(await storeState<string>(page, "s.regionId")).toBe("europe");
  // Frame sources stay bounded after the jump.
  const sources = await page.evaluate(() => {
    const w = window as unknown as { __atmos: { map: { getStyle(): { sources: Record<string, unknown> } } } };
    return Object.keys(w.__atmos.map.getStyle().sources).filter((k) => k.startsWith("radar-frame-")).length;
  });
  expect(sources).toBeLessThanOrEqual(4);
  await page.getByRole("button", { name: /Reset view/ }).click();
});

test("metadata failure keeps the basemap usable and reports the error", async ({ page }) => {
  await page.route("https://api.rainviewer.com/public/weather-maps.json", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/?e2e=1");
  await expect(page.getByText("Radar unavailable")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Radar data request failed: .*HTTP 503/)).toBeVisible();
  await expect.poll(() => storeState<string>(page, "s.mapStatus")).toBe("ready");
  await expect(timeline(page)).toContainText("No frames yet");
});

test("rate-limited metadata (429) is reported as such, without fake data", async ({ page }) => {
  await page.route("https://api.rainviewer.com/public/weather-maps.json", (r) =>
    r.fulfill({ status: 429, body: "Too Many Requests" }),
  );
  await page.goto("/?e2e=1");
  await expect(page.getByText(/rate-limiting requests \(HTTP 429\)/)).toBeVisible({ timeout: 30_000 });
  expect(await storeState<unknown>(page, "s.catalog")).toBeNull();
});

test("failed radar tiles are reported while the map keeps working", async ({ page }) => {
  await page.unrouteAll();
  await page.route(/tilecache\.rainviewer\.com\/v2\/radar\//, (r) => r.fulfill({ status: 500, body: "" }));
  await page.goto("/?e2e=1");
  await expect(page.getByText(/radar tiles? failed to load/)).toBeVisible({ timeout: 30_000 });
  expect(await storeState<string>(page, "s.mapStatus")).toBe("ready");
});

test("keyboard focus is visible on controls", async ({ page }) => {
  await page.goto("/?e2e=1");
  await waitForRadar(page);
  const play = timeline(page).getByRole("button", { name: "Play" });
  await play.focus();
  await page.keyboard.press("Tab"); // move focus with the keyboard so :focus-visible applies
  await page.keyboard.press("Shift+Tab");
  const ring = await play.evaluate((el) => {
    const cs = getComputedStyle(el);
    return cs.boxShadow !== "none" || cs.outlineStyle !== "none";
  });
  expect(ring).toBe(true);
  // Typing in an unrelated field does not trigger timeline shortcuts.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "probe";
    document.body.appendChild(input);
  });
  await page.locator("#probe").fill("k l , .");
  expect(await storeState<boolean>(page, "s.isPlaying")).toBe(false);
});

test("metadata is fetched once on load and manual refresh never duplicates requests", async ({ page }) => {
  const metaRequests: number[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("https://api.rainviewer.com/public/weather-maps.json")) metaRequests.push(Date.now());
  });
  // Slow the provider down so a second click lands while the first is in flight.
  await page.route("https://api.rainviewer.com/public/weather-maps.json", async (route) => {
    const res = await route.fetch();
    await new Promise((r) => setTimeout(r, metaRequests.length > 1 ? 1500 : 0));
    await route.fulfill({ response: res });
  });
  await page.goto("/?e2e=1");
  await waitForRadar(page);
  expect(metaRequests.length).toBe(1);

  const refresh = page.getByRole("button", { name: /Refresh radar data/ });
  await refresh.click();
  await expect(page.getByRole("button", { name: "Refreshing radar data" })).toBeDisabled();
  await page.getByRole("button", { name: "Refreshing radar data" }).click({ force: true }).catch(() => {});
  await expect(page.getByRole("button", { name: "Refresh radar data" })).toBeEnabled();
  expect(metaRequests.length).toBe(2);
});
