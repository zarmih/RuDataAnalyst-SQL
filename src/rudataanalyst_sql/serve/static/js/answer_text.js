import { explainServerMessage } from "./server_message.js";
import { safetyState, shownRowLimit } from "./state.js";

const SAFETY = {
  passed: "ограничения пройдены; это не смысловая правильность",
  blocked: "SQL заблокирован ограничениями",
  schema_mismatch: "SQL не соответствует схеме",
  structural_only: "схема не подтверждена",
  unknown: "статус ограничений неизвестен",
};

const CONFIDENCE = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

function modeLine(mode) {
  return mode === "generate" ? "Только SQL" : "Сгенерировать и выполнить";
}

export function answerText(view) {
  if (!view || typeof view !== "object") return "";
  const lines = [
    `База: ${view.domain || ""}`,
    `Вопрос: ${view.question || ""}`,
    `Режим: ${modeLine(view.mode)}`,
  ];
  const gen = view.gen;
  if (gen && typeof gen.sql === "string") {
    lines.push("", "SQL:", gen.sql);
  }
  if (gen && typeof gen.explanation === "string" && gen.explanation.trim()) {
    lines.push("", "Объяснение:", gen.explanation);
  }
  if (gen && Array.isArray(gen.assumptions)) {
    const items = gen.assumptions.filter((item) => typeof item === "string" && item.trim());
    if (items.length) {
      lines.push("", "Допущения:");
      for (const item of items) lines.push(`- ${item}`);
    }
  }
  if (gen) {
    const safety = SAFETY[safetyState(gen)] || SAFETY.unknown;
    const confidence = typeof gen.confidence === "string" ? CONFIDENCE[gen.confidence] : "";
    lines.push("", `Ограничения: ${safety}`);
    lines.push(confidence ? `Самооценка: ${confidence}` : "Самооценка: не указана");
    const explained = explainServerMessage(gen.error);
    if (explained) {
      if (explained.ru) lines.push(`Пояснение проверки: ${explained.ru}`);
      lines.push(`Сообщение проверки: ${explained.raw}`);
    }
  }
  if (view.query && Array.isArray(view.query.rows)) {
    const truncated = view.query.truncated === true
      ? "показана только часть"
      : view.query.truncated === false
        ? "сервер не назвал это размером базы"
        : "сервер не сообщил, полный ли ответ";
    lines.push("", `Показано строк: ${view.query.rows.length} (${truncated}).`);
    const limit = shownRowLimit(view.query);
    if (view.query.truncated === true && limit) {
      lines.push(`Сервер отдаёт не больше ${limit} строк.`);
    }
  }
  if (view.phase === "request_error") {
    lines.push("", "Ответ сервера не принят как результат SQL.");
    for (const line of view.error?.lines || []) {
      if (typeof line === "string" && line.trim()) lines.push(line);
    }
  }
  lines.push("", "Текст собран из показанного ответа вкладки. Новая генерация не запускалась.");
  return lines.join("\n");
}
