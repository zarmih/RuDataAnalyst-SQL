/** Counts describe only the given arrays, not the whole database. */

function isCount(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function columnProfile(columns, rows) {
  if (!Array.isArray(columns)) return [];
  const rowArrays = [];
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (Array.isArray(row)) rowArrays.push(row);
    }
  }
  return columns.map((column, index) => {
    let nulls = 0;
    let empties = 0;
    let zeros = 0;
    let bools = 0;
    for (const row of rowArrays) {
      const cell = row[index];
      if (cell === null || cell === undefined) nulls += 1;
      else if (cell === "") empties += 1;
      else if (cell === 0) zeros += 1;
      else if (cell === true || cell === false) bools += 1;
    }
    return {
      name: String(column),
      rows: rowArrays.length,
      nulls,
      empties,
      zeros,
      bools,
    };
  });
}

export function profileLine(stat) {
  if (stat == null || typeof stat !== "object" || typeof stat.name !== "string") return "";
  if (!isCount(stat.rows) || !isCount(stat.nulls) || !isCount(stat.empties) || !isCount(stat.zeros) || !isCount(stat.bools)) {
    return "";
  }
  const { name, nulls, empties, zeros, bools } = stat;
  return `В полученных строках «${name}»: NULL — ${nulls}, пустых строк — ${empties}, нулей — ${zeros}, логических — ${bools}. Это не статистика всей базы.`;
}
