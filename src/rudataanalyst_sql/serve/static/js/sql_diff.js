/** Non-strings count as "". An empty string has no lines; other breaks are \r\n, \n, or \r. */
function sourceText(value) {
  return typeof value === "string" ? value : "";
}

function splitLines(text) {
  if (text === "") return [];
  return text.split(/\r\n|\n|\r/);
}

function lineLcs(before, after) {
  const n = before.length;
  const m = after.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i];
    const next = dp[i + 1];
    const line = before[i];
    for (let j = m - 1; j >= 0; j -= 1) {
      if (line === after[j]) row[j] = next[j + 1] + 1;
      else row[j] = next[j] >= row[j + 1] ? next[j] : row[j + 1];
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ type: "same", text: before[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // Equal LCS tails: drop the old line before adding the new one.
      out.push({ type: "remove", text: before[i] });
      i += 1;
    } else {
      out.push({ type: "add", text: after[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: "remove", text: before[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ type: "add", text: after[j] });
    j += 1;
  }
  return out;
}

export function diffSql(before, after) {
  return lineLcs(splitLines(sourceText(before)), splitLines(sourceText(after)));
}
