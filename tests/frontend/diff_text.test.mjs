import assert from "node:assert/strict";
import test from "node:test";

import { diffText } from "../../src/rudataanalyst_sql/serve/static/js/diff_text.js";

const HEADER = "Сравнение SQL. Запрос не выполняется.";
const LEGEND = "Минус — закреплённый ответ, плюс — текущий.";
const SAME = "Закреплённый и текущий SQL совпадают.";

test("identical SQL uses the short form and does not list lines", () => {
  const sql = "SELECT id\nFROM users\nWHERE name = '<script>alert(1)</script>'";
  const text = diffText(sql, sql);
  assert.equal(text, `${HEADER}\n${SAME}`);
  assert.equal(text.includes("SELECT"), false);
  assert.equal(text.includes("- "), false);
  assert.equal(text.includes("+ "), false);
  assert.equal(diffText("", ""), `${HEADER}\n${SAME}`);
});

test("a one-line change keeps hostile text and says the query is not executed", () => {
  const hostile = "<script>alert(\"x\")</script>";
  const before = `SELECT id\nFROM users\nWHERE name = '${hostile}'`;
  const after = "SELECT id\nFROM users\nWHERE name = 'ok'";
  const text = diffText(before, after);
  assert.equal(text, [
    HEADER,
    LEGEND,
    "  SELECT id",
    "  FROM users",
    `- WHERE name = '${hostile}'`,
    "+ WHERE name = 'ok'",
  ].join("\n"));
  assert.equal(text.includes("- "), true);
  assert.equal(text.includes("+ "), true);
  assert.equal(text.includes(hostile), true);
  assert.equal(text.startsWith("Сравнение SQL. Запрос не выполняется."), true);
  assert.equal(text.includes("<div"), false);
  assert.equal(text.includes("<pre"), false);
  assert.equal(text.includes("<p>"), false);
  assert.equal(text.includes("&lt;"), false);
  assert.equal(text.includes("&quot;"), false);
});

test("non-strings are passed through and are not the short form", () => {
  assert.equal(diffText(null, undefined), `${HEADER}\n${LEGEND}`);
  assert.equal(diffText(1, "SELECT '<script>'"), [
    HEADER,
    LEGEND,
    "+ SELECT '<script>'",
  ].join("\n"));
  assert.equal(diffText("SELECT 1", { sql: "SELECT 1" }), [
    HEADER,
    LEGEND,
    "- SELECT 1",
  ].join("\n"));
});
