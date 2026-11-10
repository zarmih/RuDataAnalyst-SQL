import assert from "node:assert/strict";
import test from "node:test";

import { CSV_NULL_POLICY, formatCsvCell, toCsv } from "../../src/rudataanalyst_sql/serve/static/js/csv.js";

test("NULL, empty string, zero and false stay distinct", () => {
  assert.equal(formatCsvCell(null), "");
  assert.equal(formatCsvCell(undefined), "");
  assert.equal(formatCsvCell(""), '""');
  assert.equal(formatCsvCell(0), "0");
  assert.equal(formatCsvCell(false), "false");
  assert.equal(formatCsvCell(true), "true");
  assert.notEqual(formatCsvCell(null), formatCsvCell(""));
  assert.notEqual(formatCsvCell(0), formatCsvCell(false));
});

test("quotes, commas, newlines and cyrillic are escaped", () => {
  assert.equal(formatCsvCell('сказал "да"'), '"сказал ""да"""');
  assert.equal(formatCsvCell("а, б"), '"а, б"');
  assert.equal(formatCsvCell("строка\nдва"), '"строка\nдва"');
  assert.equal(formatCsvCell("привет"), "привет");
});

test("spreadsheet formulas are forced to text", () => {
  for (const value of ["=1+1", "+1", "-1", "@sum", "\t=1", "\r=1", "=cmd|'/c calc'!A0"]) {
    const cell = formatCsvCell(value);
    assert.equal(cell.startsWith("'") || cell.startsWith("\"'"), true, value);
    assert.equal(cell.includes(value), true);
  }
  assert.equal(formatCsvCell(-5), "'-5");
});

test("file is UTF-8 with BOM and CRLF, NULL policy is documented", () => {
  const csv = toCsv(
    ["имя", "заметка", "qty", "flag"],
    [
      ["Альфа", null, 0, false],
      ["", "привет, мир", 2, true],
      ["=2+2", "строка\nдва", 3, false],
    ],
  );
  assert.equal(csv[0], "\uFEFF");
  assert.match(csv, /Альфа/);
  assert.match(csv, /\r\n/);
  assert.match(csv, /Альфа,,0,false/);
  assert.match(csv, /"",\"привет, мир\",2,true/);
  assert.match(csv, /'=2\+2/);
  assert.match(CSV_NULL_POLICY, /NULL записывается пустым полем/);
  assert.match(CSV_NULL_POLICY, /пустая строка/i);
});
