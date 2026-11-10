import assert from "node:assert/strict";
import test from "node:test";

import { questionFromName } from "../../src/rudataanalyst_sql/serve/static/js/question_from_name.js";

test("table only asks to show that table", () => {
  assert.equal(questionFromName("  orders  "), "Покажи данные таблицы orders.");
  assert.equal(questionFromName("orders", undefined), "Покажи данные таблицы orders.");
});

test("table and column are both named in the question", () => {
  assert.equal(
    questionFromName(" orders ", " status "),
    "Покажи столбец status таблицы orders.",
  );
});

test("blank column falls back to table-only", () => {
  assert.equal(questionFromName("orders", ""), "Покажи данные таблицы orders.");
  assert.equal(questionFromName("orders", "   "), "Покажи данные таблицы orders.");
  assert.equal(questionFromName("orders", null), "Покажи данные таблицы orders.");
});

test("hostile name round-trip stays inside the sentence as text", () => {
  const name = "<script>alert(1)</script>";
  const text = questionFromName(`  ${name}  `, `  ${name}  `);
  assert.equal(text, `Покажи столбец ${name} таблицы ${name}.`);
  assert.equal(text.includes("&lt;"), false);
  assert.equal(text.includes("<p>"), false);
  assert.equal(text.includes("SELECT"), false);
  assert.equal(questionFromName(name, "  "), `Покажи данные таблицы ${name}.`);
});

test("non-string table returns empty string", () => {
  assert.equal(questionFromName(null, "id"), "");
  assert.equal(questionFromName(undefined, "id"), "");
  assert.equal(questionFromName(1, "id"), "");
  assert.equal(questionFromName({}, "id"), "");
  assert.equal(questionFromName("   ", "id"), "");
  assert.equal(questionFromName("", "id"), "");
});
