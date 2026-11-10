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

function skipSingleQuoted(sql, i) {
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === "'") {
      if (sql[j + 1] === "'") {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  return sql.length;
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
    if (ch === "'") {
      j = skipSingleQuoted(sql, j);
      continue;
    }
    if (ch === '"' || ch === "`" || ch === "[") {
      const ident = readIdentifier(sql, j);
      if (ident) {
        j = ident.end;
        continue;
      }
    }
    if (sql.startsWith("--", j) || sql.startsWith("/*", j)) {
      const next = skipNoise(sql, j);
      j = next === j ? j + 1 : next;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { end: j + 1 };
    }
    j += 1;
  }
  return { end: sql.length };
}

function matchKeyword(sql, i, word) {
  if (i > 0 && /[\p{L}\p{N}_]/u.test(sql[i - 1])) return false;
  if (sql.slice(i, i + word.length).toUpperCase() !== word.toUpperCase()) return false;
  const next = sql[i + word.length];
  return next == null || !/[\p{L}\p{N}_]/u.test(next);
}

const STOP_KEYWORDS = new Set([
  "WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "WINDOW", "UNION",
  "INTERSECT", "EXCEPT", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
  "CROSS", "FULL", "NATURAL", "ON", "USING",
]);

function readTableReference(sql, i) {
  let j = skipNoise(sql, i);
  if (j >= sql.length) return null;
  if (sql[j] === "(") {
    const paren = readParen(sql, j);
    return { name: null, end: paren ? paren.end : sql.length };
  }
  const ident = readIdentifier(sql, j);
  if (!ident) return null;
  let name = ident.name;
  let end = ident.end;
  let after = skipNoise(sql, end);
  if (after < sql.length && sql[after] === ".") {
    const secondIdent = readIdentifier(sql, after + 1);
    if (secondIdent) {
      name = secondIdent.name;
      end = secondIdent.end;
    }
  }
  return { name, end };
}

export function tablesInSql(sql) {
  if (typeof sql !== "string") return [];
  const seen = new Set();
  const tables = [];
  function add(name) {
    if (typeof name === "string" && name && !seen.has(name)) {
      seen.add(name);
      tables.push(name);
    }
  }

  let i = 0;
  while (i < sql.length) {
    i = skipNoise(sql, i);
    if (i >= sql.length) break;

    if (sql[i] === "'") {
      i = skipSingleQuoted(sql, i);
      continue;
    }

    if (matchKeyword(sql, i, "FROM")) {
      i += 4;
      while (i < sql.length) {
        const ref = readTableReference(sql, i);
        if (!ref) break;
        if (ref.name) add(ref.name);
        i = skipNoise(sql, ref.end);
        if (i >= sql.length) break;

        if (matchKeyword(sql, i, "AS")) {
          i = skipNoise(sql, i + 2);
          const alias = readIdentifier(sql, i);
          if (alias) i = skipNoise(sql, alias.end);
        } else if (sql[i] !== "," && sql[i] !== ";" && sql[i] !== ")") {
          const maybeAlias = readIdentifier(sql, i);
          if (maybeAlias && !STOP_KEYWORDS.has(maybeAlias.name.toUpperCase())) {
            i = skipNoise(sql, maybeAlias.end);
          }
        }

        if (i < sql.length && sql[i] === ",") {
          i += 1;
          continue;
        }
        break;
      }
      continue;
    }

    if (matchKeyword(sql, i, "JOIN")) {
      i += 4;
      const ref = readTableReference(sql, i);
      if (ref) {
        if (ref.name) add(ref.name);
        i = ref.end;
      }
      continue;
    }

    i += 1;
  }

  return tables;
}
