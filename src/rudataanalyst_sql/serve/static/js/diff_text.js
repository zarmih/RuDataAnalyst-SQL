import { diffSql } from "./sql_diff.js";

const HEADER = "Сравнение SQL. Запрос не выполняется.";
const LEGEND = "Минус — закреплённый ответ, плюс — текущий.";
const SAME = "Закреплённый и текущий SQL совпадают.";

const PREFIX = {
  remove: "- ",
  add: "+ ",
  same: "  ",
};

export function diffText(before, after) {
  if (typeof before === "string" && before === after) {
    return `${HEADER}\n${SAME}`;
  }
  const lines = [HEADER, LEGEND];
  for (const entry of diffSql(before, after)) {
    lines.push(`${PREFIX[entry.type]}${entry.text}`);
  }
  return lines.join("\n");
}
