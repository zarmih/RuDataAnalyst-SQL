const EXACT = {
  "Empty SQL": "Модель не вернула SQL.",
  "Unsafe or non-SELECT SQL detected.": "Разрешён только один читающий запрос SELECT.",
  "Multiple SQL statements are not allowed.": "Несколько операторов подряд сервер не выполняет.",
};

export function explainServerMessage(error) {
  if (typeof error !== "string" || !error.trim()) return null;
  const raw = error.trim();
  if (EXACT[raw]) return { ru: EXACT[raw], raw };
  if (raw.startsWith("Schema hallucination:")) {
    const rest = raw.slice("Schema hallucination:".length).trim();
    const named = [
      [/^no such table:\s*(.+)$/i, "таблицы"],
      [/^no such column:\s*(.+)$/i, "столбца"],
      [/^no such function:\s*(.+)$/i, "функции"],
    ];
    for (const [pattern, kind] of named) {
      const match = rest.match(pattern);
      const name = match?.[1]?.trim();
      if (name) return { ru: `В схеме нет ${kind} «${name}».`, raw };
    }
    return { ru: "В SQL есть таблица, столбец или функция, которых нет в схеме этой базы.", raw };
  }
  if (raw.startsWith("SQL error:")) {
    return { ru: "Сервер не смог проверить SQL.", raw };
  }
  if (raw.startsWith("Unexpected error:")) {
    return { ru: "Проверка SQL завершилась сбоем.", raw };
  }
  return { ru: "", raw };
}
