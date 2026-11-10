import { expect, test } from "@playwright/test";

import { fulfillJson, queryBody } from "./helpers.js";

async function openWithWideTable(page) {
  await page.route("**/v1/domains", async (route) => {
    await fulfillJson(route, 200, {
      domains: ["warehouse"],
      built_in: ["warehouse"],
      managed: [],
    });
  });
  await page.route("**/v1/sql/query", async (route) => {
    await fulfillJson(route, 200, queryBody({}, {
      query_result: {
        columns: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
        rows: [[
          "очень-длинное-значение-без-пробелов-".repeat(4),
          "б", "в", "г", "д", "е", "ж", "з",
        ]],
        truncated: false,
      },
    }));
  });
  await page.goto("/");
  await page.locator("#question").fill("широкая таблица");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.locator("table")).toBeVisible();
}

async function overflow(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(".table-scroll");
    const code = document.querySelector(".sql-scroll");
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      table: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      code: code ? code.scrollWidth - code.clientWidth : 0,
    };
  });
}

test("keyboard reaches real buttons and the question keeps a visible focus", async ({ page }) => {
  await page.route("**/v1/domains", async (route) => {
    await fulfillJson(route, 200, {
      domains: ["warehouse", "subscriptions"],
      built_in: ["warehouse", "subscriptions"],
      managed: [],
    });
  });
  await page.goto("/");
  await expect(page.locator("#domain")).toHaveValue("warehouse");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#question")).toBeFocused();
  const outline = await page.locator("#question").evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
  const example = page.getByRole("button", { name: /warehouse/ });
  await example.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#question")).toHaveValue(/Electronics/);
  await expect(example).toHaveAttribute("type", "button");
});

for (const width of [360, 390, 768, 1440]) {
  test(`layout at ${width}px keeps page scroll local to the table`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openWithWideTable(page);
    const box = await page.evaluate(() => {
      const composer = document.querySelector(".composer").getBoundingClientRect();
      const outcome = document.querySelector(".outcome").getBoundingClientRect();
      return {
        composerTop: composer.top,
        outcomeTop: outcome.top,
        composerLeft: composer.left,
        outcomeLeft: outcome.left,
        composerWidth: composer.width,
      };
    });
    if (width >= 960) {
      expect(box.outcomeLeft).toBeGreaterThan(box.composerLeft + 40);
      expect(box.composerWidth).toBeGreaterThanOrEqual(320);
    } else {
      expect(box.outcomeTop).toBeGreaterThan(box.composerTop + 40);
    }
    const metrics = await overflow(page);
    expect(metrics.page).toBeLessThanOrEqual(1);
    if (width <= 390) expect(metrics.table).toBeGreaterThan(0);
  });
}

test("200% zoom does not widen the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openWithWideTable(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const metrics = await overflow(page);
  expect(metrics.page).toBeLessThanOrEqual(1);
});

test("reduced motion stops the indeterminate animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/v1/domains", async (route) => {
    await fulfillJson(route, 200, { domains: ["warehouse"], built_in: ["warehouse"], managed: [] });
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/v1/sql/query", async (route) => {
    await gate;
    await fulfillJson(route, 200, queryBody());
  });
  await page.goto("/");
  await page.locator("#question").fill("жди");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.locator(".indeterminate")).toBeVisible();
  const animation = await page.locator(".indeterminate").evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
  release();
  await expect(page.locator("#outcome")).toContainText("Альфа");
});
