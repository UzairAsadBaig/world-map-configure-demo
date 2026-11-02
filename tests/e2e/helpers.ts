import { expect, type Page } from "@playwright/test";

/**
 * Real RainViewer tiles, fetched once per test run and replayed from memory.
 * The data stays real; we just avoid re-downloading the same tile in every
 * test and blowing through the provider's per-minute limit.
 */
const tileCache = new Map<string, { body: Buffer; contentType: string }>();

export async function useTileCache(page: Page) {
  await page.route(/tilecache\.rainviewer\.com/, async (route) => {
    const url = route.request().url();
    const hit = tileCache.get(url);
    if (hit) {
      await route.fulfill({
        body: hit.body,
        contentType: hit.contentType,
        headers: { "access-control-allow-origin": "*" },
      });
      return;
    }
    try {
      const res = await route.fetch();
      const body = await res.body();
      if (res.ok()) tileCache.set(url, { body, contentType: res.headers()["content-type"] ?? "image/png" });
      await route.fulfill({ response: res, body });
    } catch {
      // The page/test closed while the request was in flight; nothing to do.
    }
  });
}

export function collectConsoleProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || /hydrat/i.test(text)) problems.push(`${msg.type()}: ${text}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  return problems;
}

export const timeline = (page: Page) => page.getByRole("group", { name: "Radar timeline" });
export const frameSlider = (page: Page) => timeline(page).getByRole("slider", { name: "Radar frame" });

/** The live label describing the frame actually on screen. */
export async function shownLabel(page: Page) {
  return (await timeline(page).locator("[aria-live]").innerText()).replace(/\s+/g, " ").trim();
}

export async function waitForRadar(page: Page) {
  await expect(timeline(page).locator("[aria-live]")).toContainText(/\d\d:\d\d UTC/);
  await page.waitForFunction(() => {
    const w = window as unknown as { __atmos?: { store: { getState(): { displayedFrame: unknown } } } };
    return !!w.__atmos?.store.getState().displayedFrame;
  });
}

export async function storeState<T>(page: Page, pick: string): Promise<T> {
  // The hook appears once the dynamically loaded map component has mounted.
  await page.waitForFunction(() => !!(window as unknown as { __atmos?: unknown }).__atmos);
  return page.evaluate((expr) => {
    const w = window as unknown as { __atmos: { store: { getState(): Record<string, unknown> } } };
    const s = w.__atmos.store.getState();
    return new Function("s", `return (${expr});`)(s);
  }, pick) as Promise<T>;
}
