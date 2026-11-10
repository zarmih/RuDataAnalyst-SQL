const KEYWORDS = new Set(
  "select from where join left right inner outer full cross on group by order limit offset and or not in is null as distinct having case when then else end with union all asc desc like between exists cast".split(" "),
);

export function tokenizeSql(sql) {
  const text = String(sql ?? "");
  const tokens = [];
  let i = 0;
  const push = (type, value) => {
    if (!value) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.type === type && type === "plain") prev.text += value;
    else tokens.push({ type, text: value });
  };
  while (i < text.length) {
    if (text.startsWith("--", i)) {
      let end = text.indexOf("\n", i);
      end = end === -1 ? text.length : end + 1;
      push("comment", text.slice(i, end));
      i = end;
      continue;
    }
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === ch && text[j + 1] === ch) {
          j += 2;
          continue;
        }
        if (text[j] === ch) {
          j += 1;
          break;
        }
        j += 1;
      }
      push("string", text.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j += 1;
      const word = text.slice(i, j);
      push(KEYWORDS.has(word.toLowerCase()) ? "keyword" : "ident", word);
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[0-9.]/.test(text[j])) j += 1;
      push("number", text.slice(i, j));
      i = j;
      continue;
    }
    push("plain", ch);
    i += 1;
  }
  return tokens;
}
