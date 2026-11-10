function presentName(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function questionFromName(table, column) {
  const tableName = presentName(table);
  if (!tableName) return "";
  const columnName = presentName(column);
  if (!columnName) return `Покажи данные таблицы ${tableName}.`;
  return `Покажи столбец ${columnName} таблицы ${tableName}.`;
}
