import { expect, test } from "@playwright/test";

test("mock worker round-trip shows schema, rows and rejects a path", async ({ page }) => {
  page.on("dialog", () => {
    throw new Error("unexpected dialog");
  });
  await page.goto("/");
  await expect(page.locator("#health-status")).toContainText("Модель не загружена");
  await expect(page.locator("#health-status")).not.toContainText("генерация удалась");
  await page.locator("#domain").selectOption("e2e_demo");
  await page.locator("#question").fill("Покажи демонстрационные строки");
  await page.getByRole("button", { name: "Только SQL", exact: true }).click();
  await expect(page.locator("#outcome")).toContainText("SELECT sku, note, qty, active FROM demo_items");
  await expect(page.locator("#outcome")).toContainText("Мок ответ");
  await expect(page.getByRole("heading", { name: "SQL без выполнения", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Проверка ограничений" })).toContainText("не гарантия смысловой правильности");

  await page.getByRole("button", { name: "Показать схему базы" }).click();
  await expect(page.locator("#schema-sql")).toContainText("CREATE TABLE demo_items");
  await expect(page.locator("#schema-outline")).toContainText("demo_items");
  await expect(page.locator("#schema-outline")).toContainText("sku");
  await expect(page.getByRole("button", { name: "Вставить sku" })).toBeVisible();
  await expect(page.locator("#schema-panel")).not.toContainText("database.sqlite");
  await expect(page.locator("#schema-panel")).not.toContainText(".e2e-runtime");

  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByLabel("значение NULL")).toBeVisible();
  await expect(page.getByLabel("число 0").first()).toBeVisible();
  await expect(page.getByLabel("пустая строка").first()).toBeVisible();
  await expect(page.locator("#outcome")).toContainText("Альфа");
  await expect(page.locator("#outcome")).toContainText("<script>alert(1)</script>");
  const hostile = await page.locator("#outcome").evaluate((root) => root.querySelectorAll("img, script").length);
  expect(hostile).toBe(0);
  await page.getByRole("button", { name: "Показать полностью" }).click();
  await expect(page.locator("#outcome")).toContainText("я".repeat(40));

  const schema = await page.request.get("/v1/schema/e2e_demo");
  expect(schema.status()).toBe(200);
  const schemaText = await schema.text();
  expect(schemaText).toContain("demo_items");
  expect(schemaText).not.toContain("database.sqlite");
  expect(schemaText).not.toContain(".e2e-runtime");
  expect(schemaText).not.toContain("/etc/passwd");

  const missing = await page.request.get("/v1/schema/does-not-exist");
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toEqual({ detail: "domain_not_found" });

  const traversed = await page.request.get("/v1/schema/..%2F..%2Fetc%2Fpasswd");
  expect([400, 404]).toContain(traversed.status());
  expect(await traversed.text()).not.toContain("root:");

  const posted = await page.request.post("/v1/schema/e2e_demo", { data: { path: "/etc/passwd", sql: "SELECT 1" } });
  expect(posted.status()).toBe(405);
});
