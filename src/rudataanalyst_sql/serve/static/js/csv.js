/** NULL is an empty unquoted field. An empty string is "". See CSV_NULL_POLICY. */
export const CSV_NULL_POLICY =
  "NULL записывается пустым полем без кавычек. Пустая строка записывается как \"\". Ноль записывается как 0, логическое false — как false. " +
  "Значение, которое таблица может прочитать как формулу (начало с =, +, -, @, табуляции или возврата каретки), получает префикс апострофа и становится текстом. " +
  "Так же экранируются отрицательные числа. Кавычки удваиваются, поля с запятой, кавычкой или переносом берутся в кавычки. " +
  "Файл в UTF-8 с меткой BOM. Экспорт содержит только загруженные строки и порядок ответа сервера, без локальной сортировки.";

const FORMULA_START = /^[=+\-@\t\r]/;

export function formatCsvCell(value) {
  if (value === null || value === undefined) return "";
  if (value === "") return '""';
  let text;
  if (value === false) text = "false";
  else if (value === true) text = "true";
  else text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(columns, rows) {
  const header = (columns || []).map((column) => formatCsvCell(column));
  const lines = [header.join(",")];
  for (const row of rows || []) {
    const cells = header.map((_, index) => formatCsvCell(Array.isArray(row) ? row[index] ?? null : null));
    lines.push(cells.join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
