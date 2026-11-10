const EMPTY = {
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

const QUESTION_LIMIT = 160;

function asString(value) {
  return typeof value === "string" ? value : "";
}

function safetyLabel(gen) {
  if (!gen || typeof gen.is_safe !== "boolean") return "Статус ограничений неизвестен";
  if (gen.is_safe === false) return "SQL заблокирован";
  if (gen.is_hallucinated === true) return "SQL не соответствует схеме";
  if (gen.is_hallucinated === false) return "Ограничения пройдены";
  return "Схема не подтверждена";
}

function confidenceLabel(gen) {
  const confidence = gen && typeof gen.confidence === "string" ? gen.confidence : "";
  if (confidence === "high") return "высокая";
  if (confidence === "medium") return "средняя";
  if (confidence === "low") return "низкая";
  return "не указана";
}

function rowLabel(query) {
  if (!query || typeof query !== "object" || !Array.isArray(query.rows)) return "";
  const count = query.rows.length;
  if (query.truncated === true) return `Показаны первые ${count} строк`;
  if (query.truncated === false) return `Получено ${count} строк. Это не размер базы.`;
  return "";
}

export function answerDigest(view) {
  if (view == null || typeof view !== "object") return { ...EMPTY };
  const rawQuestion = asString(view.question);
  const questionClipped = rawQuestion.length > QUESTION_LIMIT;
  const sql = view.gen && typeof view.gen.sql === "string" ? view.gen.sql : "";
  return {
    domain: asString(view.domain),
    question: questionClipped ? `${rawQuestion.slice(0, QUESTION_LIMIT)}…` : rawQuestion,
    questionClipped,
    modeLabel: view.mode === "generate" ? "Только SQL" : "Сгенерировать и выполнить",
    sql,
    sqlLineCount: sql === "" ? 0 : sql.split("\n").length,
    safetyLabel: safetyLabel(view.gen),
    confidenceLabel: confidenceLabel(view.gen),
    rowLabel: rowLabel(view.query),
  };
}
