import assert from "node:assert/strict";
import test from "node:test";

import { diffSql } from "../../src/rudataanalyst_sql/serve/static/js/sql_diff.js";

function project(diff, types) {
  return diff.filter((row) => types.includes(row.type)).map((row) => row.text).join("\n");
}

test("identical multiline text, including empty lines, is all same", () => {
  const sql = "SELECT id\nFROM users\nWHERE active = 1";
  assert.deepEqual(diffSql(sql, sql), [
    { type: "same", text: "SELECT id" },
    { type: "same", text: "FROM users" },
    { type: "same", text: "WHERE active = 1" },
  ]);
  const blank = "SELECT 1 \n\n\tFROM t";
  assert.deepEqual(diffSql(blank, blank), [
    { type: "same", text: "SELECT 1 " },
    { type: "same", text: "" },
    { type: "same", text: "\tFROM t" },
  ]);
  assert.deepEqual(diffSql("", ""), []);
  assert.deepEqual(diffSql("\n", "\n"), [
    { type: "same", text: "" },
    { type: "same", text: "" },
  ]);
});

test("a middle line change is a remove then an add", () => {
  const before = "SELECT id\nFROM users\nWHERE active = 1";
  const after = "SELECT id\nFROM users\nWHERE active = 0";
  const diff = diffSql(before, after);
  assert.deepEqual(diff, [
    { type: "same", text: "SELECT id" },
    { type: "same", text: "FROM users" },
    { type: "remove", text: "WHERE active = 1" },
    { type: "add", text: "WHERE active = 0" },
  ]);
  assert.equal(project(diff, ["same", "remove"]), before);
  assert.equal(project(diff, ["same", "add"]), after);
});

test("an inserted line keeps the surrounding lines", () => {
  const before = "SELECT id\nFROM users";
  const after = "SELECT id\nJOIN orders ON orders.user_id = users.id\nFROM users";
  const diff = diffSql(before, after);
  assert.deepEqual(diff, [
    { type: "same", text: "SELECT id" },
    { type: "add", text: "JOIN orders ON orders.user_id = users.id" },
    { type: "same", text: "FROM users" },
  ]);
  assert.equal(project(diff, ["same", "remove"]), before);
  assert.equal(project(diff, ["same", "add"]), after);
});

test("a deleted line keeps the surrounding lines", () => {
  const before = "SELECT id\nFROM users\nWHERE active = 1";
  const after = "SELECT id\nWHERE active = 1";
  const diff = diffSql(before, after);
  assert.deepEqual(diff, [
    { type: "same", text: "SELECT id" },
    { type: "remove", text: "FROM users" },
    { type: "same", text: "WHERE active = 1" },
  ]);
  assert.equal(project(diff, ["same", "remove"]), before);
  assert.equal(project(diff, ["same", "add"]), after);
});

test("CRLF and bare CR are the same lines as LF", () => {
  const lf = "SELECT 1\n\nFROM t\n";
  const crlf = "SELECT 1\r\n\r\nFROM t\r\n";
  const cr = "SELECT 1\r\rFROM t\r";
  const expected = [
    { type: "same", text: "SELECT 1" },
    { type: "same", text: "" },
    { type: "same", text: "FROM t" },
    { type: "same", text: "" },
  ];
  assert.deepEqual(diffSql(crlf, lf), expected);
  assert.deepEqual(diffSql(cr, lf), expected);
  assert.deepEqual(diffSql(crlf, cr), expected);
});

test("hostile script and img text round-trips unchanged", () => {
  const script = "<script>alert(1)</script>";
  const img = "<img src=x onerror=alert(1)>";
  const sameText = `${script}\n${img}`;
  assert.deepEqual(diffSql(sameText, sameText), [
    { type: "same", text: script },
    { type: "same", text: img },
  ]);
  const before = `${script}\nSELECT 1`;
  const after = `${img}\nSELECT 1`;
  const diff = diffSql(before, after);
  assert.deepEqual(diff, [
    { type: "remove", text: script },
    { type: "add", text: img },
    { type: "same", text: "SELECT 1" },
  ]);
  assert.equal(project(diff, ["same", "remove"]), before);
  assert.equal(project(diff, ["same", "add"]), after);
  assert.equal(diff[0].text, script);
  assert.equal(diff[1].text, img);
  const flat = JSON.stringify(diff);
  assert.equal(flat.includes("<script>alert(1)</script>"), true);
  assert.equal(flat.includes("<img src=x onerror=alert(1)>"), true);
  assert.equal(flat.includes("&lt;"), false);
  assert.equal(flat.includes("&gt;"), false);
  assert.equal(flat.includes("<p>"), false);
  assert.equal(flat.includes("\\u003c"), false);
});

test("non-strings are treated as an empty string", () => {
  assert.deepEqual(diffSql(), []);
  assert.deepEqual(diffSql(null, undefined), []);
  assert.deepEqual(diffSql(0, false), []);
  assert.deepEqual(diffSql(["SELECT 1"], new String("SELECT 1")), []);
  assert.deepEqual(diffSql(1, "SELECT 1"), [{ type: "add", text: "SELECT 1" }]);
  assert.deepEqual(diffSql("SELECT 1", { sql: "SELECT 1" }), [{ type: "remove", text: "SELECT 1" }]);
  assert.deepEqual(diffSql(null, "a\nb"), [
    { type: "add", text: "a" },
    { type: "add", text: "b" },
  ]);
});

test("shared lines stay aligned across a replacement", () => {
  const before = "SELECT a\nSELECT b\nSELECT c";
  const after = "SELECT b\nSELECT c\nSELECT d";
  const diff = diffSql(before, after);
  assert.deepEqual(diff, [
    { type: "remove", text: "SELECT a" },
    { type: "same", text: "SELECT b" },
    { type: "same", text: "SELECT c" },
    { type: "add", text: "SELECT d" },
  ]);
  assert.equal(project(diff, ["same", "remove"]), before);
  assert.equal(project(diff, ["same", "add"]), after);
});
