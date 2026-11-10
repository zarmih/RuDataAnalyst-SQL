import assert from "node:assert/strict";
import test from "node:test";

import { answerDigest } from "../../src/rudataanalyst_sql/serve/static/js/answer_digest.js";

test("full query view summarizes rows without calling them the database size", () => {
  const digest = answerDigest({
    domain: "warehouse",
    question: "Сколько товаров на складе?",
    mode: "query",
    phase: "result",
    gen: {
      sql: "SELECT count(*) AS n\nFROM products\nWHERE active = 1",
      explanation: "считаем активные",
      assumptions: [],
      confidence: "high",
      is_safe: true,
      is_hallucinated: false,
      error: null,
    },
    query: {
      columns: ["n"],
      rows: [[1], [2], [3]],
      truncated: false,
      row_limit: 200,
    },
  });
  assert.deepEqual(digest, {
    domain: "warehouse",
    question: "Сколько товаров на складе?",
    questionClipped: false,
    modeLabel: "Сгенерировать и выполнить",
    sql: "SELECT count(*) AS n\nFROM products\nWHERE active = 1",
    sqlLineCount: 3,
    safetyLabel: "Ограничения пройдены",
    confidenceLabel: "высокая",
    rowLabel: "Получено 3 строк. Это не размер базы.",
  });
  assert.equal(JSON.stringify(digest).includes("100%"), false);
  assert.equal(JSON.stringify(digest).includes("SAFE"), false);
});

test("generate-only view has SQL and no row label", () => {
  assert.deepEqual(answerDigest({
    domain: "subscriptions",
    question: "Список тарифов",
    mode: "generate",
    gen: {
      sql: "SELECT id, name FROM plans",
      confidence: "medium",
      is_safe: true,
      is_hallucinated: false,
    },
    query: null,
  }), {
    domain: "subscriptions",
    question: "Список тарифов",
    questionClipped: false,
    modeLabel: "Только SQL",
    sql: "SELECT id, name FROM plans",
    sqlLineCount: 1,
    safetyLabel: "Ограничения пройдены",
    confidenceLabel: "средняя",
    rowLabel: "",
  });
});

test("blocked SQL is not described as passed or semantically correct", () => {
  const digest = answerDigest({
    domain: "warehouse",
    question: "удали таблицу",
    mode: "query",
    gen: {
      sql: "DROP TABLE products",
      confidence: "low",
      is_safe: false,
      is_hallucinated: true,
    },
    query: null,
  });
  assert.deepEqual(digest, {
    domain: "warehouse",
    question: "удали таблицу",
    questionClipped: false,
    modeLabel: "Сгенерировать и выполнить",
    sql: "DROP TABLE products",
    sqlLineCount: 1,
    safetyLabel: "SQL заблокирован",
    confidenceLabel: "низкая",
    rowLabel: "",
  });
  const text = JSON.stringify(digest);
  assert.equal(text.includes("100%"), false);
  assert.equal(text.includes("SAFE"), false);
  assert.equal(text.includes("Ограничения пройдены"), false);
  assert.equal(text.includes("семантически"), false);
});

test("a 161-character question is clipped by characters and keeps <script> text", () => {
  const head = "<script>alert(1)</script>";
  const question = head + "Я".repeat(161 - head.length);
  assert.equal(question.length, 161);
  const digest = answerDigest({
    domain: "warehouse",
    question,
    mode: "query",
    gen: {
      sql: "SELECT 1",
      confidence: "high",
      is_safe: true,
      is_hallucinated: false,
    },
    query: { rows: [[1]], truncated: true },
  });
  assert.equal(digest.questionClipped, true);
  assert.equal(digest.question, `${question.slice(0, 160)}…`);
  assert.equal(digest.question.includes("<script>"), true);
  assert.equal(digest.question.includes("</script>"), true);
  assert.equal(digest.question.includes("&lt;"), false);
  assert.equal(digest.rowLabel, "Показаны первые 1 строк");

  const cut = `${"а".repeat(156)}<script>`;
  assert.equal(cut.length, 164);
  const sliced = answerDigest({ question: cut, mode: "generate", gen: { sql: "SELECT 1" } });
  assert.equal(sliced.question, `${"а".repeat(156)}<scr…`);
  assert.equal(sliced.question.includes("<scr"), true);
  assert.equal(sliced.question.includes("<script>"), false);
  assert.equal(sliced.questionClipped, true);

  const exact = "б".repeat(160);
  const kept = answerDigest({ question: exact, mode: "generate" });
  assert.equal(kept.question, exact);
  assert.equal(kept.questionClipped, false);
});

test("unknown confidence and unconfirmed schema are not a pass", () => {
  const certain = answerDigest({
    domain: "warehouse",
    question: "вопрос",
    mode: "generate",
    gen: {
      sql: "SELECT 1",
      is_safe: true,
      is_hallucinated: false,
      confidence: "certain",
    },
  });
  assert.equal(certain.confidenceLabel, "не указана");
  assert.equal(answerDigest({
    domain: "warehouse",
    question: "вопрос",
    mode: "generate",
    gen: { sql: "SELECT 1", is_safe: true, is_hallucinated: false, confidence: null },
  }).confidenceLabel, "не указана");

  assert.equal(answerDigest({
    domain: "logistics",
    question: "маршрут",
    mode: "generate",
    gen: { sql: "SELECT ghost FROM nowhere", is_safe: true, is_hallucinated: true, confidence: "high" },
  }).safetyLabel, "SQL не соответствует схеме");
  assert.equal(answerDigest({
    domain: "logistics",
    question: "маршрут",
    mode: "generate",
    gen: { sql: "SELECT 1", is_safe: true, confidence: "high" },
  }).safetyLabel, "Схема не подтверждена");
  const unknown = answerDigest({
    domain: "logistics",
    question: "маршрут",
    mode: "query",
    gen: { sql: "", is_safe: "yes", confidence: "high" },
  });
  assert.equal(unknown.safetyLabel, "Статус ограничений неизвестен");
  assert.equal(unknown.sql, "");
  assert.equal(unknown.sqlLineCount, 0);
});

test("null view is an empty digest", () => {
  const empty = {
    domain: "",
    question: "",
    questionClipped: false,
    modeLabel: "",
    sql: "",
    sqlLineCount: 0,
    safetyLabel: "",
    confidenceLabel: "",
    rowLabel: "",
  };
  assert.deepEqual(answerDigest(null), empty);
  assert.deepEqual(answerDigest(undefined), empty);
  assert.deepEqual(answerDigest("view"), empty);
});
