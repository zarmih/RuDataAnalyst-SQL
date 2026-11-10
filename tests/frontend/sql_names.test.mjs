import assert from "node:assert/strict";
import test from "node:test";

import { tablesInSql } from "../../src/rudataanalyst_sql/serve/static/js/sql_names.js";

test("simple from extracts the table name", () => {
  assert.deepEqual(tablesInSql("SELECT id, name FROM products"), ["products"]);
  assert.deepEqual(tablesInSql("SELECT * FROM   orders   WHERE id = 1"), ["orders"]);
});

test("join extracts tables from both from and join clauses", () => {
  const sql = "SELECT * FROM products JOIN orders ON products.id = orders.product_id LEFT JOIN customers ON orders.cust_id = customers.id";
  assert.deepEqual(tablesInSql(sql), ["products", "orders", "customers"]);
});

test("quoted hostile name is returned exactly without HTML stripping", () => {
  const hostile = "<script>alert(1)</script>";
  assert.deepEqual(tablesInSql(`SELECT * FROM "${hostile}"`), [hostile]);
  assert.deepEqual(tablesInSql(`SELECT * FROM \`${hostile}\``), [hostile]);
  assert.deepEqual(tablesInSql(`SELECT * FROM [${hostile}]`), [hostile]);
});

test("comment that hides a fake table is ignored", () => {
  const lineComment = "SELECT 1 -- FROM fake_table\nFROM real_table";
  assert.deepEqual(tablesInSql(lineComment), ["real_table"]);

  const blockComment = "SELECT 1 /* FROM fake_table JOIN fake_orders */ FROM real_table";
  assert.deepEqual(tablesInSql(blockComment), ["real_table"]);
});

test("string that hides a fake table is ignored", () => {
  const sql = "SELECT 'FROM fake_table JOIN fake_orders' AS text FROM real_table";
  assert.deepEqual(tablesInSql(sql), ["real_table"]);
});

test("subquery is skipped and does not invent a table name", () => {
  const sql = "SELECT * FROM (SELECT 1 AS x) AS sub JOIN products ON products.id = sub.x";
  assert.deepEqual(tablesInSql(sql), ["products"]);

  const onlySub = "SELECT * FROM (SELECT id FROM accounts)";
  assert.deepEqual(tablesInSql(onlySub), []);
});

test("schema qualifier returns only the table part", () => {
  assert.deepEqual(tablesInSql("SELECT * FROM main.products"), ["products"]);
  assert.deepEqual(tablesInSql("SELECT * FROM \"main\".\"products\""), ["products"]);
  assert.deepEqual(tablesInSql("SELECT * FROM [dbo].[orders]"), ["orders"]);
});

test("non-string returns an empty array", () => {
  assert.deepEqual(tablesInSql(null), []);
  assert.deepEqual(tablesInSql(undefined), []);
  assert.deepEqual(tablesInSql(123), []);
  assert.deepEqual(tablesInSql({}), []);
  assert.deepEqual(tablesInSql([]), []);
  assert.deepEqual(tablesInSql(true), []);
});

test("duplicate table name is dropped preserving first occurrence", () => {
  const sql = "SELECT * FROM products JOIN products ON 1=1";
  assert.deepEqual(tablesInSql(sql), ["products"]);
});

test("comma-separated tables in from clause are all captured", () => {
  const sql = "SELECT * FROM products p, inventory AS i, customers c WHERE p.id = i.product_id";
  assert.deepEqual(tablesInSql(sql), ["products", "inventory", "customers"]);
});

test("keywords inside identifiers are not treated as FROM or JOIN", () => {
  assert.deepEqual(tablesInSql("SELECT * FROMAGE FROM products"), ["products"]);
  assert.deepEqual(tablesInSql("SELECT * FROM products_from_store"), ["products_from_store"]);
  assert.deepEqual(tablesInSql("SELECT * FROM user_joins"), ["user_joins"]);
});
