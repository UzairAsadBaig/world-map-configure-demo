import { expect, test } from "@playwright/test";
import { collectConsoleProblems, timeline, useTileCache, waitForRadar } from "./helpers";

test.beforeEach(async ({ page }) => {
  await useTileCache(page);
});

test("mobile: map-first layout, no horizontal overflow, bottom sheet controls", async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto("/?e2e=1");
  await waitForRadar(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Map occupies most of the screen.
  const map = await page.locator("main").boundingBox();
  const vp = page.viewportSize()!;
  expect(map!.height).toBeGreaterThan(vp.height * 0.55);

  // Desktop sidebar hidden; Layers button opens the bottom sheet.
  await expect(page.getByRole("complementary")).toBeHidden();
  await page.getByRole("button", { name: "Layers" }).click();
  const sheet = page.getByRole("dialog", { name: /Layers & regions/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "United Kingdom" }).click(); // region click closes sheet
  await expect(sheet).toBeHidden();

  // Attribution and zoom controls are not covered by panels.
  await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-zoom-in")).toBeVisible();

  // Touch-friendly timeline buttons (at least 36 px).
  const play = await timeline(page).getByRole("button", { name: "Play" }).boundingBox();
  expect(play!.height).toBeGreaterThanOrEqual(36);
  expect(problems).toEqual([]);
});
