function isBlankQuery(query) {
  return typeof query !== "string" || query.trim() === "";
}

function contains(value, needle) {
  return typeof value === "string" && value.toLowerCase().includes(needle);
}

function columnsOf(table) {
  return Array.isArray(table.columns) ? table.columns : [];
}

function constraintsOf(table) {
  return Array.isArray(table.constraints) ? table.constraints : [];
}

function columnMatches(column, needle) {
  return Boolean(column) && typeof column === "object" && (
    contains(column.name, needle) || contains(column.detail, needle)
  );
}

export function filterOutline(outline, query) {
  if (!outline || typeof outline !== "object" || !Array.isArray(outline.tables)) {
    return { tables: [], unparsed: true, matched: 0 };
  }

  if (isBlankQuery(query)) {
    const tables = outline.tables.map((table) => {
      const source = table && typeof table === "object" ? table : {};
      return {
        name: source.name,
        columns: columnsOf(source),
        constraints: constraintsOf(source),
        hiddenColumns: 0,
      };
    });
    return { tables, unparsed: outline.unparsed, matched: tables.length };
  }

  const needle = query.toLowerCase();
  const tables = [];
  for (const table of outline.tables) {
    if (!table || typeof table !== "object") continue;
    const columns = columnsOf(table);
    const constraints = constraintsOf(table);
    const keepAll = contains(table.name, needle) || constraints.some((item) => contains(item, needle));
    if (keepAll) {
      tables.push({ name: table.name, columns, constraints, hiddenColumns: 0 });
      continue;
    }
    const matchedColumns = columns.filter((column) => columnMatches(column, needle));
    if (matchedColumns.length === 0) continue;
    tables.push({
      name: table.name,
      columns: matchedColumns,
      constraints,
      hiddenColumns: columns.length - matchedColumns.length,
    });
  }
  return { tables, unparsed: outline.unparsed, matched: tables.length };
}
