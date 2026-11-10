function knownTableNames(tables) {
  const known = new Set();
  for (const table of tables) {
    if (!table || typeof table !== "object" || typeof table.name !== "string") continue;
    known.add(table.name.toLowerCase());
  }
  return known;
}

export function checkTables(names, outline) {
  if (!outline || typeof outline !== "object" || !Array.isArray(outline.tables)) {
    return { checked: false, items: [] };
  }

  const known = knownTableNames(outline.tables);
  const items = [];
  if (Array.isArray(names)) {
    for (const name of names) {
      if (typeof name !== "string") continue;
      items.push({ name, found: known.has(name.toLowerCase()) });
    }
  }
  return { checked: true, items };
}
