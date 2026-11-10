import assert from "node:assert/strict";
import test from "node:test";

import { answerText } from "../../src/rudataanalyst_sql/serve/static/js/answer_text.js";

const hostile = "<img src=x onerror=alert(1)><script>alert(1)</script>";

test("copied answer keeps the question, SQL and assumptions as plain text", () => {
  const text = answerText({
    domain: "warehouse",
    question: "Сколько товаров?",
    mode: "query",
    phase: "result",
    gen: {
      sql: `SELECT '${hostile}'`,
      explanation: hostile,
      assumptions: ["категория не задана", ""],
      confidence: "medium",
      is_safe: true,
      is_hallucinated: false,
      error: null,
    },
    query: { columns: ["n"], rows: [[1], [2]], truncated: true },
  });
  assert.match(text, /База: warehouse/);
  assert.match(text, /Вопрос: Сколько товаров\?/);
  assert.match(text, /Режим: Сгенерировать и выполнить/);
  assert.match(text, /SELECT '<img/);
  assert.match(text, /Объяснение:\n<img/);
  assert.match(text, /- категория не задана/);
  assert.match(text, /Самооценка: средняя/);
  assert.match(text, /Показано строк: 2 \(показана только часть\)/);
  assert.equal(text.includes("100%"), false);
  assert.equal(text.includes("<script"), true);
  assert.equal(text.includes("<p>"), false);
  assert.equal(text.includes("<img"), true);
});

test("unknown confidence and a blocked query are not called safe", () => {
  const text = answerText({
    domain: "warehouse",
    question: "удали",
    mode: "generate",
    phase: "blocked_sql",
    gen: {
      sql: "DROP TABLE products",
      explanation: "",
      assumptions: [],
      confidence: "certain",
      is_safe: false,
      is_hallucinated: false,
      error: "Unsafe or non-SELECT SQL detected.",
    },
    query: null,
  });
  assert.match(text, /Режим: Только SQL/);
  assert.match(text, /Ограничения: SQL заблокирован/);
  assert.match(text, /Самооценка: не указана/);
  assert.match(text, /Unsafe or non-SELECT SQL detected/);
  assert.equal(text.includes("Ограничения пройдены"), false);
  assert.equal(text.includes("Показано строк"), false);
});
