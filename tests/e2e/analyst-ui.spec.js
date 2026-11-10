import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

import { XSS, domainsOk, fulfillJson, generateBody, queryBody } from "./helpers.js";

let domainsMode = "ok";

test.beforeEach(async ({ page }) => {
  domainsMode = "ok";
  page.on("dialog", () => {
    throw new Error("unexpected dialog");
  });
  await page.route("**/v1/domains", async (route) => {
    if (domainsMode === "fail") {
      await route.abort("failed");
      return;
    }
    if (domainsMode === "empty") {
      await fulfillJson(route, 200, { domains: [], built_in: [], managed: [] });
      return;
    }
    if (domainsMode === "subscriptions") {
      await fulfillJson(route, 200, {
        domains: ["subscriptions"],
        built_in: ["subscriptions"],
        managed: [],
      });
      return;
    }
    await fulfillJson(route, 200, domainsOk);
  });
});

async function openApp(page) {
  await page.goto("/");
  if (domainsMode === "ok") await expect(page.locator("#domain")).toHaveValue("warehouse");
}

async function ask(page, question) {
  await page.locator("#question").fill(question);
}

test("generate only shows SQL, assumptions and separate statuses", async ({ page }) => {
  await page.route("**/v1/sql/generate", async (route) => {
    await fulfillJson(route, 200, generateBody({
      sql: "SELECT name FROM products WHERE category = 'Electronics'",
      assumptions: ["категория записана как Electronics"],
      confidence: "high",
    }));
  });
  await openApp(page);
  await ask(page, "Покажи электронику");
  await page.getByRole("button", { name: "Только SQL", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SQL без выполнения", exact: true })).toBeVisible();
  await expect(page.locator("#outcome")).toContainText("SELECT name FROM products");
  await expect(page.locator("#outcome")).toContainText("категория записана как Electronics");
  await expect(page.getByRole("region", { name: "Проверка ограничений" })).toContainText("не гарантия смысловой правильности");
  await expect(page.getByRole("region", { name: "Самооценка модели" })).toContainText("высокая");
  await expect(page.locator("#outcome")).not.toContainText("100%");
  await expect(page.locator("#outcome")).not.toContainText("SQL SAFE");
  await expect(page.getByRole("button", { name: "Выполнить этот SQL" })).toHaveCount(0);
  await page.locator("#question").fill("другой вопрос, ещё не отправлен");
  await expect(page.locator(".snapshot")).toContainText("Покажи электронику");
  await expect(page.locator(".snapshot")).not.toContainText("другой вопрос");
});

test("rows, empty result and truncated sample use the actual row count", async ({ page }) => {
  let mode = "rows";
  await page.route("**/v1/sql/query", async (route) => {
    if (mode === "rows") {
      await fulfillJson(route, 200, queryBody({}, {
        query_result: {
          columns: ["name", "note", "qty", "flag"],
          rows: [
            ["Альфа", null, 0, false],
            ["", "", 2, true],
            ["=2+2", `${"длинное".repeat(30)}\nвторая`, 3, false],
          ],
          truncated: false,
        },
      }));
      return;
    }
    if (mode === "empty") {
      await fulfillJson(route, 200, queryBody({}, {
        query_result: { columns: ["name"], rows: [], truncated: false },
      }));
      return;
    }
    await fulfillJson(route, 200, queryBody({}, {
      query_result: { columns: ["name"], rows: [["а"], ["б"]], truncated: true, row_limit: 2 },
    }));
  });
  await openApp(page);
  await ask(page, "покажи строки");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByLabel("значение NULL")).toBeVisible();
  await expect(page.getByLabel("пустая строка").first()).toBeVisible();
  await expect(page.getByLabel("число 0")).toBeVisible();
  await expect(page.getByLabel("логическое false").first()).toBeVisible();
  await expect(page.locator(".sample-note").first()).toContainText("не число записей в базе");
  await expect(page.locator(".sample-note").first()).not.toContainText("50");
  await page.getByRole("button", { name: "Показать полностью" }).click();
  await expect(page.locator("#outcome")).toContainText("вторая");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт CSV" }).click();
  const download = await downloadPromise;
  const csv = await fs.readFile(await download.path(), "utf8");
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain("Альфа");
  expect(csv).toContain("false");
  expect(csv).toContain("'=2+2");
  expect(csv).not.toContain("\n=2+2");

  mode = "empty";
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByRole("heading", { name: "Запрос выполнен, строк нет", exact: true })).toBeVisible();

  mode = "truncated";
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.locator(".sample-note").first()).toContainText("Показаны первые 2");
  await expect(page.locator(".sample-note").first()).toContainText("результат ограничен сервером");
  await expect(page.locator(".sample-note").first()).toContainText("не больше 2");
  await expect(page.locator(".export-box")).toContainText("только показанную часть");
  await expect(page.locator("#outcome")).not.toContainText("первые 50");
});

test("http errors, non-json, network and empty domain list stay out of the SQL verdict", async ({ page }) => {
  await page.route("**/v1/sql/query", async (route) => {
    await fulfillJson(route, 422, {
      detail: [{ loc: ["body", "question"], msg: "Field required", type: "missing" }],
    });
  });
  await openApp(page);
  await ask(page, "сохрани меня");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByRole("heading", { name: "Запрос отклонён сервером", exact: true })).toBeVisible();
  await expect(page.locator("#outcome")).toContainText("body.question: Field required");
  await expect(page.locator("#outcome")).toContainText("не статус проверки SQL");
  await expect(page.locator("#outcome")).not.toContainText("SQL заблокирован");
  await expect(page.locator("#question")).toHaveValue("сохрани меня");

  await page.unroute("**/v1/sql/query");
  await page.route("**/v1/sql/query", async (route) => {
    await fulfillJson(route, 500, { detail: "Internal Server Error" });
  });
  await page.getByRole("button", { name: "Повторить отправку" }).click();
  await expect(page.locator("#outcome")).toContainText("HTTP 500");
  await expect(page.locator("#outcome")).not.toContainText("Ограничения пройдены");

  await page.unroute("**/v1/sql/query");
  await page.route("**/v1/sql/query", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "<html><script>alert(1)</script></html>" });
  });
  await page.getByRole("button", { name: "Повторить отправку" }).click();
  await expect(page.getByRole("heading", { name: "Модель не ответила", exact: true })).toBeVisible();
  await expect(page.locator("script")).toHaveCount(1);

  await page.unroute("**/v1/sql/query");
  await page.route("**/v1/sql/query", async (route) => {
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Повторить отправку" }).click();
  await expect(page.getByRole("heading", { name: "Не удалось отправить запрос", exact: true })).toBeVisible();
  await expect(page.locator("#question")).toHaveValue("сохрани меня");
});

test("unknown shape is not marked safe or unsafe", async ({ page }) => {
  await page.route("**/v1/sql/generate", async (route) => {
    await fulfillJson(route, 200, { sql: "SELECT 1", explanation: "без статуса" });
  });
  await openApp(page);
  await ask(page, "без статуса");
  await page.getByRole("button", { name: "Только SQL", exact: true }).click();
  await expect(page.getByRole("region", { name: "Проверка ограничений" })).toContainText("неизвест");
  await expect(page.getByRole("region", { name: "Самооценка модели" })).toContainText("не указан");
  await expect(page.locator("#outcome")).not.toContainText("Ограничения пройдены");
  await expect(page.locator("#outcome")).not.toContainText("SQL заблокирован");
});

test("unsafe SQL, schema mismatch and query timeout are different states", async ({ page }) => {
  const cases = [
    queryBody({ sql: "DROP TABLE products", is_safe: false, is_hallucinated: false, error: "Unsafe or non-SELECT SQL detected." }, { query_error: "unsafe_sql" }),
    queryBody({ sql: "SELECT * FROM missing_table", is_safe: true, is_hallucinated: true, error: "Schema hallucination: no such table" }, { query_error: "schema_hallucination" }),
    queryBody({ sql: "SELECT * FROM products" }, { query_error: "query_timeout" }),
  ];
  let index = 0;
  await page.route("**/v1/sql/query", async (route) => {
    await fulfillJson(route, 200, cases[index]);
  });
  await openApp(page);
  await ask(page, "различи состояния");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByRole("heading", { name: "SQL заблокирован", exact: true })).toBeVisible();
  await expect(page.locator("#outcome")).toContainText("Разрешён только один читающий запрос SELECT");
  await expect(page.locator("#outcome")).toContainText("Unsafe or non-SELECT SQL detected.");
  await expect(page.getByRole("heading", { name: "SQL не соответствует схеме", exact: true })).toHaveCount(0);

  index = 1;
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByRole("heading", { name: "SQL не соответствует схеме", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SQL заблокирован", exact: true })).toHaveCount(0);
  await expect(page.locator("#outcome")).toContainText("Schema hallucination");

  index = 2;
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByRole("heading", { name: "Выполнение прервано по времени", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SQL заблокирован", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Проверка ограничений" })).toContainText("Ограничения пройдены");
});

test("a second click does not send a second request", async ({ page }) => {
  let calls = 0;
  await page.route("**/v1/sql/query", async (route) => {
    calls += 1;
    await fulfillJson(route, 200, queryBody());
  });
  await openApp(page);
  await ask(page, "дважды");
  await page.evaluate(() => {
    const button = document.getElementById("btn-query");
    button.click();
    button.click();
  });
  await expect(page.locator("#outcome")).toContainText("Альфа");
  expect(calls).toBe(1);
});

test("cancel keeps the question and a late response does not replace the next one", async ({ page }) => {
  let releaseSlow;
  await page.route("**/v1/sql/query", async (route) => {
    const question = route.request().postDataJSON().question;
    if (question.includes("медленный")) {
      await new Promise((resolve) => {
        releaseSlow = resolve;
      });
      try {
        await fulfillJson(route, 200, queryBody({ sql: "SELECT slow_should_not_win" }));
      } catch {
        // The browser already aborted this wait.
      }
      return;
    }
    await fulfillJson(route, 200, queryBody({ sql: "SELECT fast_result" }));
  });
  await openApp(page);
  await ask(page, "медленный вопрос");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect.poll(() => typeof releaseSlow).toBe("function");
  await expect(page.getByRole("button", { name: "Прекратить ожидание" })).toBeVisible();
  await expect(page.locator("#cancel-hint")).toContainText("не обещает остановить");
  await page.getByRole("button", { name: "Прекратить ожидание" }).click();
  await expect(page.locator("#form-notice")).toContainText("Ожидание прекращено");
  await expect(page.locator("#question")).toHaveValue("медленный вопрос");
  await expect(page.locator("#outcome")).not.toContainText("slow_should_not_win");

  await ask(page, "быстрый вопрос");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.locator("#outcome")).toContainText("SELECT fast_result");
  releaseSlow();
  await page.waitForTimeout(400);
  await expect(page.locator("#outcome")).toContainText("SELECT fast_result");
  await expect(page.locator("#outcome")).not.toContainText("slow_should_not_win");
});

test("browser timeout is not reported as an SQL verdict", async ({ page }) => {
  await page.addInitScript(() => {
    window.__RUDATA_REQUEST_TIMEOUT_MS = 300;
  });
  let done;
  const finished = new Promise((resolve) => {
    done = resolve;
  });
  await page.route("**/v1/sql/query", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      await fulfillJson(route, 200, queryBody({ sql: "SELECT too_late" }));
    } catch {
      // Aborted by the browser timeout.
    }
    done();
  });
  await openApp(page);
  await ask(page, "долгий");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByRole("heading", { name: "Время ожидания истекло", exact: true })).toBeVisible();
  await expect(page.locator("#outcome")).not.toContainText("SELECT too_late");
  await expect(page.locator("#question")).toHaveValue("долгий");
  await finished;
});

test("a removed domain keeps the question and an example cannot switch to a missing database", async ({ page }) => {
  await page.route("**/v1/sql/query", async (route) => {
    domainsMode = "subscriptions";
    await fulfillJson(route, 400, { detail: "domain_not_found" });
  });
  await openApp(page);
  await ask(page, "вопрос про склад");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.locator("#form-notice")).toContainText("исчезла из списка");
  await expect(page.locator("#question")).toHaveValue("вопрос про склад");
  await expect(page.locator("#domain")).toHaveValue("");
  await expect(page.locator("#outcome")).not.toContainText("SQL заблокирован");

  await page.getByRole("button", { name: "Электроника на складе · warehouse" }).click();
  await expect(page.locator("#domain")).toHaveValue("");
  await expect(page.locator("#form-notice")).toContainText("Её нет в списке");
  await expect(page.locator("#question")).toHaveValue("вопрос про склад");
});

test("schema view shows server DDL and clears it when the domain is rejected", async ({ page }) => {
  let schemaCalls = 0;
  await page.route("**/v1/schema/**", async (route) => {
    schemaCalls += 1;
    if (schemaCalls === 1) {
      await fulfillJson(route, 200, {
        domain: "warehouse",
        source: "built_in",
        dialect: "sqlite",
        schema_sql: "CREATE TABLE products (id INTEGER);\nCREATE TABLE \"<img src=x onerror=alert(1)>\" (note TEXT);",
      });
      return;
    }
    await fulfillJson(route, 400, { detail: "domain_not_found" });
  });
  let sqlCalls = 0;
  await page.route("**/v1/sql/**", async () => {
    sqlCalls += 1;
  });
  await openApp(page);
  await page.getByRole("button", { name: "Показать схему базы" }).click();
  await expect(page.locator("#schema-sql")).toContainText("CREATE TABLE products");
  await expect(page.locator("#schema-outline")).toContainText("products");
  await expect(page.locator("#schema-outline")).toContainText("id");
  await expect(page.locator("#schema-caption")).toContainText("не диаграмма");
  await expect(page.locator("#schema-panel")).toContainText("<img src=x onerror=alert(1)>");
  const hostile = await page.locator("#schema-panel").evaluate((root) => root.querySelectorAll("img, script").length);
  expect(hostile).toBe(0);
  await expect(page.locator("#schema-panel")).not.toContainText("database.sqlite");
  await page.getByRole("button", { name: "Вставить products" }).click();
  await expect(page.locator("#question")).toHaveValue("products");
  await expect(page.locator("#form-notice")).toContainText("не отправлен");
  expect(sqlCalls).toBe(0);
  await page.getByRole("button", { name: "Показать схему базы" }).click();
  await expect(page.locator("#schema-error")).toContainText("не найдена");
  await expect(page.locator("#schema-sql")).toHaveText("");
});

test("hostile SQL, explanation, assumptions and cells stay text", async ({ page }) => {
  await page.route("**/v1/sql/query", async (route) => {
    await fulfillJson(route, 200, queryBody(
      {
        sql: `SELECT '${XSS}'`,
        explanation: XSS,
        assumptions: [XSS],
      },
      {
        query_result: {
          columns: [XSS, "qty"],
          rows: [[XSS, 0]],
          truncated: false,
        },
      },
    ));
  });
  await openApp(page);
  await ask(page, "xss");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.locator("#outcome")).toContainText(XSS);
  const hostile = await page.locator("#outcome").evaluate((root) => root.querySelectorAll("img, script").length);
  expect(hostile).toBe(0);
  const html = await page.locator("#outcome").evaluate((root) => root.innerHTML);
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
});

test("there is no domain list, then retry restores it without dropping the question", async ({ page }) => {
  domainsMode = "empty";
  await page.goto("/");
  await expect(page.locator("#domains-status")).toContainText("Нет доступных баз");
  await page.locator("#question").fill("черновик");
  domainsMode = "fail";
  await page.reload();
  await expect(page.locator("#domains-status")).toContainText("Не удалось загрузить список баз");
  await page.locator("#question").fill("черновик");
  domainsMode = "ok";
  await page.getByRole("button", { name: "Повторить загрузку баз" }).click();
  await expect(page.locator("#domain")).toHaveValue("warehouse");
  await expect(page.locator("#question")).toHaveValue("черновик");
});

test("history restores a saved answer without a new request and ignores a missing domain", async ({ page }) => {
  let calls = 0;
  await page.route("**/v1/sql/generate", async (route) => {
    calls += 1;
    if (calls === 1) {
      await fulfillJson(route, 200, generateBody());
      return;
    }
    if (calls === 2) {
      await fulfillJson(route, 200, generateBody({ sql: "SELECT other_table" }));
      return;
    }
    await fulfillJson(route, 400, { detail: "domain_not_found" });
  });
  await openApp(page);
  await ask(page, "первый вопрос");
  await page.getByRole("button", { name: "Только SQL", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SQL без выполнения", exact: true })).toBeVisible();
  await expect(page.locator("#outcome")).toContainText("SELECT name FROM products");
  await page.getByRole("button", { name: "Скопировать ответ" }).click();
  await expect(page.locator("#form-notice")).toContainText("Ответ скопирован");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("первый вопрос");
  expect(copied).toContain("SELECT name FROM products");
  expect(copied).not.toContain("100%");
  await ask(page, "второй вопрос");
  await page.getByRole("button", { name: "Только SQL", exact: true }).click();
  await expect(page.locator("#outcome")).toContainText("SELECT other_table");
  await page.getByRole("button", { name: /первый вопрос/ }).click();
  await expect(page.locator("#question")).toHaveValue("первый вопрос");
  await expect(page.locator("#outcome")).toContainText("SELECT name FROM products");
  await expect(page.locator("#outcome")).not.toContainText("SELECT other_table");
  await expect(page.locator("#form-notice")).toContainText("не отправлен");
  expect(calls).toBe(2);

  domainsMode = "subscriptions";
  await ask(page, "третий вопрос");
  await page.getByRole("button", { name: "Только SQL", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Запрос отклонён сервером", exact: true })).toBeVisible();
  await expect(page.locator("#domain")).toHaveValue("");
  await page.getByRole("button", { name: /первый вопрос/ }).click();
  await expect(page.locator("#question")).toHaveValue("первый вопрос");
  await expect(page.locator("#domain")).toHaveValue("");
  await expect(page.locator("#outcome")).toContainText("SELECT name FROM products");
  await expect(page.locator("#form-notice")).toContainText("нет в списке");
  expect(calls).toBe(3);
});

test("schema mismatch opens the submitted domain and refuses a missing one", async ({ page }) => {
  await page.route("**/v1/sql/query", async (route) => {
    await fulfillJson(route, 200, queryBody({
      sql: "SELECT missing_column FROM products",
      is_safe: true,
      is_hallucinated: true,
      error: "Schema hallucination: no such column",
    }));
  });
  const schemaUrls = [];
  await page.route("**/v1/schema/**", async (route) => {
    schemaUrls.push(new URL(route.request().url()).pathname);
    await fulfillJson(route, 200, {
      domain: "warehouse",
      source: "built_in",
      dialect: "sqlite",
      schema_sql: "CREATE TABLE products (id INTEGER);",
    });
  });
  await openApp(page);
  await page.locator("#domain").selectOption("subscriptions");
  await ask(page, "вопрос про склад");
  await page.locator("#domain").selectOption("warehouse");
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.getByRole("heading", { name: "SQL не соответствует схеме", exact: true })).toBeVisible();
  await page.locator("#domain").selectOption("subscriptions");
  await page.locator("#question").fill("черновик не должен уйти");
  await page.getByRole("button", { name: "Показать схему этой базы" }).click();
  await expect(page.locator("#schema-outline")).toContainText("products");
  await expect(page.locator("#domain")).toHaveValue("warehouse");
  await expect(page.locator("#question")).toHaveValue("черновик не должен уйти");
  expect(schemaUrls).toEqual(["/v1/schema/warehouse"]);

  domainsMode = "subscriptions";
  await page.route("**/v1/sql/query", async (route) => {
    await fulfillJson(route, 400, { detail: "domain_not_found" });
  });
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.locator("#domain")).toHaveValue("");
  await page.getByRole("button", { name: /вопрос про склад/ }).click();
  await expect(page.getByRole("heading", { name: "SQL не соответствует схеме", exact: true })).toBeVisible();
  await expect(page.locator("#domain")).toHaveValue("");
  await page.getByRole("button", { name: "Показать схему этой базы" }).click();
  await expect(page.locator("#form-notice")).toContainText("нет в списке");
  await expect(page.locator("#domain")).toHaveValue("");
  expect(schemaUrls).toEqual(["/v1/schema/warehouse"]);
});

test("a pinned answer stays beside the next one without another request", async ({ page }) => {
  let calls = 0;
  await page.route("**/v1/sql/generate", async (route) => {
    calls += 1;
    await fulfillJson(route, 200, generateBody({
      sql: calls === 1 ? "SELECT first_answer" : "SELECT second_answer",
    }));
  });
  await openApp(page);
  await ask(page, "первый");
  await page.getByRole("button", { name: "Только SQL", exact: true }).click();
  await expect(page.locator("#outcome")).toContainText("SELECT first_answer");
  await page.getByRole("button", { name: "Закрепить этот ответ" }).click();
  await expect(page.getByRole("region", { name: "Закреплённый ответ" })).toContainText("SELECT first_answer");
  expect(calls).toBe(1);

  await ask(page, "второй");
  await page.getByRole("button", { name: "Только SQL", exact: true }).click();
  await expect(page.locator(".pane-current")).toContainText("SELECT second_answer");
  await expect(page.getByRole("region", { name: "Закреплённый ответ" })).toContainText("SELECT first_answer");
  await expect(page.getByRole("region", { name: "Закреплённый ответ" })).not.toContainText("SELECT second_answer");
  expect(calls).toBe(2);

  await page.setViewportSize({ width: 1440, height: 900 });
  const wide = await page.evaluate(() => {
    const pin = document.querySelector(".pane-pin").getBoundingClientRect();
    const current = document.querySelector(".pane-current").getBoundingClientRect();
    return {
      beside: current.left > pin.left + 40,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(wide.beside).toBe(true);
  expect(wide.page).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 800 });
  const narrow = await page.evaluate(() => {
    const pin = document.querySelector(".pane-pin").getBoundingClientRect();
    const current = document.querySelector(".pane-current").getBoundingClientRect();
    return {
      stacked: current.top > pin.top + 40,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(narrow.stacked).toBe(true);
  expect(narrow.page).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Закрепить этот ответ" }).click();
  await expect(page.getByRole("region", { name: "Закреплённый ответ" })).toContainText("SELECT second_answer");
  await expect(page.locator("#form-notice")).toContainText("заменён");
  await page.getByRole("button", { name: "Снять закрепление" }).click();
  await expect(page.getByRole("region", { name: "Закреплённый ответ" })).toHaveCount(0);
  await expect(page.locator(".pane-current")).toContainText("SELECT second_answer");
  expect(calls).toBe(2);
});

test("capture the analyst workspace on a desktop and a phone", async ({ page }) => {
  await page.route("**/v1/sql/query", async (route) => {
    await fulfillJson(route, 200, queryBody(
      { assumptions: ["показаны только загруженные строки"] },
      {
        query_result: {
          columns: ["name", "note", "qty", "flag"],
          rows: [["Альфа", null, 0, false], ["Бета", "значение", 4, true]],
          truncated: true,
        },
      },
    ));
  });
  await openApp(page);
  await page.getByRole("button", { name: /Электроника/ }).click();
  await page.getByRole("button", { name: "Сгенерировать и выполнить" }).click();
  await expect(page.locator(".sample-note").first()).toContainText("результат ограничен сервером");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "docs/screenshots/after-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/screenshots/after-mobile.png", fullPage: true });
});
