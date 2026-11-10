import assert from "node:assert/strict";
import test from "node:test";

import { columnProfile, profileLine } from "../../src/rudataanalyst_sql/serve/static/js/column_profile.js";

test("NULL, empty string, zero and false are distinct counts", () => {
  const [stat] = columnProfile(
    ["value"],
    [[null], [undefined], [""], [0], [false], [true], ["0"], ["false"], [1]],
  );
  assert.deepEqual(stat, {
    name: "value",
    rows: 9,
    nulls: 2,
    empties: 1,
    zeros: 1,
    bools: 2,
  });
  assert.equal(stat.nulls + stat.empties + stat.zeros + stat.bools, 6);
});

test("a short row counts the missing cell as null", () => {
  const stats = columnProfile(
    ["id", "note", "flag"],
    [
      [0, "", false],
      [null],
      ["0", "0", true],
    ],
  );
  assert.deepEqual(stats, [
    { name: "id", rows: 3, nulls: 1, empties: 0, zeros: 1, bools: 0 },
    { name: "note", rows: 3, nulls: 1, empties: 1, zeros: 0, bools: 0 },
    { name: "flag", rows: 3, nulls: 1, empties: 0, zeros: 0, bools: 2 },
  ]);
  assert.equal(stats[0].zeros, 1);
  assert.equal(stats[0].bools, 0);
  assert.equal(stats[2].bools, 2);
  assert.equal(stats[2].zeros, 0);
});

test("a hostile column name is preserved and not turned into HTML", () => {
  const hostile = "<img src=x onerror=alert(1)><script>alert(1)</script>";
  const [stat] = columnProfile([hostile], [[null]]);
  assert.equal(stat.name, hostile);
  assert.equal(stat.name.includes("&lt;"), false);
  assert.equal(stat.name.includes("<script>"), true);
  const line = profileLine(stat);
  assert.equal(line.includes(hostile), true);
  assert.equal(line.includes("&lt;"), false);
  assert.equal(line.includes("<script>"), true);
});

test("profileLine states these counts are not the whole database", () => {
  const [stat] = columnProfile(["qty"], [[null], [""], [0], [false]]);
  const line = profileLine(stat);
  assert.equal(
    line,
    "В полученных строках «qty»: NULL — 1, пустых строк — 1, нулей — 1, логических — 1. Это не статистика всей базы.",
  );
  assert.equal(line.includes("не статистика всей базы"), true);
  assert.equal(line.includes("всей таблицы"), false);
});

test("non-array columns return an empty profile", () => {
  assert.deepEqual(columnProfile(null, [[1]]), []);
  assert.deepEqual(columnProfile(undefined, [[1]]), []);
  assert.deepEqual(columnProfile("id", [[1]]), []);
  assert.deepEqual(columnProfile({ length: 1, 0: "id" }, [[1]]), []);
  assert.deepEqual(columnProfile(1, []), []);
});

test("a non-array rows value counts as no rows", () => {
  assert.deepEqual(columnProfile(["id"], null), [
    { name: "id", rows: 0, nulls: 0, empties: 0, zeros: 0, bools: 0 },
  ]);
  assert.deepEqual(columnProfile(["id"], { 0: [0] }), [
    { name: "id", rows: 0, nulls: 0, empties: 0, zeros: 0, bools: 0 },
  ]);
});

test("a malformed stat does not produce a size claim", () => {
  assert.equal(profileLine(null), "");
  assert.equal(profileLine(undefined), "");
  assert.equal(profileLine("qty"), "");
  assert.equal(profileLine({}), "");
  assert.equal(profileLine({ name: "qty", rows: 1, nulls: 0, empties: 0, zeros: 0 }), "");
  assert.equal(profileLine({ name: 1, rows: 1, nulls: 0, empties: 0, zeros: 0, bools: 0 }), "");
  assert.equal(profileLine({ name: "qty", rows: 1, nulls: "0", empties: 0, zeros: 0, bools: 0 }), "");
});
