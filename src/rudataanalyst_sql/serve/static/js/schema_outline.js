function skipNoise(sql, i) {
  let j = i;
  while (j < sql.length) {
    if (/\s/.test(sql[j])) {
      j += 1;
      continue;
    }
    if (sql.startsWith("--", j)) {
      const nl = sql.indexOf("\n", j);
      j = nl < 0 ? sql.length : nl + 1;
      continue;
    }
    if (sql.startsWith("/*", j)) {
      const end = sql.indexOf("*/", j + 2);
      j = end < 0 ? sql.length : end + 2;
      continue;
    }
    break;
  }
  return j;
}

function skipQuoted(sql, i) {
  const quote = sql[i];
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === quote) {
      if (sql[j + 1] === quote) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  return sql.length;
}

function matchKeyword(sql, i, word) {
  if (sql.slice(i, i + word.length).toUpperCase() !== word) return false;
  const next = sql[i + word.length];
  return next == null || !/[\p{L}\p{N}_]/u.test(next);
}

function readIdentifier(sql, i) {
  let j = skipNoise(sql, i);
  if (j >= sql.length) return null;
  const quote = sql[j];
  if (quote === '"' || quote === "`" || quote === "[") {
    const endQuote = quote === "[" ? "]" : quote;
    let name = "";
    j += 1;
    while (j < sql.length) {
      if (sql[j] === endQuote) {
        if (endQuote !== "]" && sql[j + 1] === endQuote) {
          name += endQuote;
          j += 2;
          continue;
        }
        return { name, end: j + 1 };
      }
      name += sql[j];
      j += 1;
    }
    return null;
  }
  if (!/[\p{L}_]/u.test(quote)) return null;
  let name = quote;
  j += 1;
  while (j < sql.length && /[\p{L}\p{N}_]/u.test(sql[j])) {
    name += sql[j];
    j += 1;
  }
  return { name, end: j };
}

function readParen(sql, i) {
  if (sql[i] !== "(") return null;
  let depth = 0;
  let j = i;
  while (j < sql.length) {
    const ch = sql[j];
    if (ch === "'" || ch === '"' || ch === "`") {
      j = skipQuoted(sql, j);
      continue;
    }
    if (sql.startsWith("--", j) || sql.startsWith("/*", j)) {
      const next = skipNoise(sql, j);
      j = next === j ? j + 1 : next;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { inner: sql.slice(i + 1, j), end: j + 1 };
    }
    j += 1;
  }
  return null;
}

function collapse(text) {
  return text.replace(/\s+/g, " ").trim();
}

function splitTopLevel(sql) {
  const parts = [];
  let start = 0;
  let j = 0;
  while (j < sql.length) {
    const ch = sql[j];
    if (ch === "'" || ch === '"' || ch === "`") {
      j = skipQuoted(sql, j);
      continue;
    }
    if (sql.startsWith("--", j) || sql.startsWith("/*", j)) {
      const next = skipNoise(sql, j);
      j = next === j ? j + 1 : next;
      continue;
    }
    if (ch === "(") {
      const body = readParen(sql, j);
      if (!body) break;
      j = body.end;
      continue;
    }
    if (ch === ",") {
      parts.push(sql.slice(start, j));
      start = j + 1;
    }
    j += 1;
  }
  parts.push(sql.slice(start));
  return parts;
}

function classifyPart(part) {
  const trimmed = part.trim();
  if (!trimmed) return null;
  let i = skipNoise(trimmed, 0);
  if (matchKeyword(trimmed, i, "CONSTRAINT")) {
    i = skipNoise(trimmed, i + "CONSTRAINT".length);
    const ident = readIdentifier(trimmed, i);
    if (ident) i = skipNoise(trimmed, ident.end);
  }
  if (
    matchKeyword(trimmed, i, "PRIMARY")
    || matchKeyword(trimmed, i, "FOREIGN")
    || matchKeyword(trimmed, i, "UNIQUE")
    || matchKeyword(trimmed, i, "CHECK")
  ) {
    return { kind: "constraint", text: collapse(trimmed) };
  }
  const ident = readIdentifier(trimmed, i);
  if (!ident) return { kind: "constraint", text: collapse(trimmed) };
  return { kind: "column", name: ident.name, detail: collapse(trimmed.slice(ident.end)) };
}

function parseCreateTable(sql, i) {
  if (!matchKeyword(sql, i, "CREATE")) return null;
  let j = skipNoise(sql, i + "CREATE".length);
  if (matchKeyword(sql, j, "TEMPORARY")) j = skipNoise(sql, j + "TEMPORARY".length);
  else if (matchKeyword(sql, j, "TEMP")) j = skipNoise(sql, j + "TEMP".length);
  if (!matchKeyword(sql, j, "TABLE")) return null;
  j = skipNoise(sql, j + "TABLE".length);
  if (matchKeyword(sql, j, "IF")) {
    const notAt = skipNoise(sql, j + "IF".length);
    if (!matchKeyword(sql, notAt, "NOT")) return null;
    const existsAt = skipNoise(sql, notAt + "NOT".length);
    if (!matchKeyword(sql, existsAt, "EXISTS")) return null;
    j = skipNoise(sql, existsAt + "EXISTS".length);
  }
  let ident = readIdentifier(sql, j);
  if (!ident) return null;
  j = skipNoise(sql, ident.end);
  let name = ident.name;
  if (sql[j] === ".") {
    const second = readIdentifier(sql, j + 1);
    if (!second) return null;
    name = second.name;
    j = skipNoise(sql, second.end);
  }
  if (sql[j] !== "(") return null;
  const body = readParen(sql, j);
  if (!body) return null;
  const columns = [];
  const constraints = [];
  for (const part of splitTopLevel(body.inner)) {
    const item = classifyPart(part);
    if (!item) continue;
    if (item.kind === "column") columns.push({ name: item.name, detail: item.detail });
    else constraints.push(item.text);
  }
  return { table: { name, columns, constraints }, end: body.end };
}

export function outlineSchema(sql) {
  const tables = [];
  if (typeof sql !== "string" || !sql.trim()) return { tables, unparsed: true };
  let i = 0;
  while (i < sql.length) {
    const noise = skipNoise(sql, i);
    if (noise !== i) {
      i = noise;
      continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(sql, i);
      continue;
    }
    if (matchKeyword(sql, i, "CREATE")) {
      const parsed = parseCreateTable(sql, i);
      if (parsed) {
        tables.push(parsed.table);
        i = parsed.end;
        continue;
      }
      i += "CREATE".length;
      continue;
    }
    i += 1;
  }
  return { tables, unparsed: tables.length === 0 };
}
