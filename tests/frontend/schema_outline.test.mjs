import assert from "node:assert/strict";
import test from "node:test";

import { outlineSchema } from "../../src/rudataanalyst_sql/serve/static/js/schema_outline.js";

const warehouse = `CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE inventory (
    product_id INTEGER,
    FOREIGN KEY (product_id) REFERENCES products(id)
);`;

test("tables and columns come from CREATE TABLE, foreign keys stay literal", () => {
  const outline = outlineSchema(warehouse);
  assert.equal(outline.unparsed, false);
  assert.deepEqual(outline.tables.map((table) => table.name), ["products", "inventory"]);
  assert.deepEqual(outline.tables[0].columns.map((column) => column.name), ["id", "name"]);
  assert.match(outline.tables[0].columns[0].detail, /PRIMARY KEY/);
  assert.deepEqual(outline.tables[1].columns.map((column) => column.name), ["product_id"]);
  assert.equal(
    outline.tables[1].constraints[0],
    "FOREIGN KEY (product_id) REFERENCES products(id)",
  );
  assert.equal(outline.tables.some((table) => table.name === "products" && table.columns.some((column) => column.name === "id")), true);
  assert.equal(outline.tables.length, 2);
});

test("quoted names, defaults with semicolons and nested checks stay intact", () => {
  const odd = outlineSchema(`CREATE TABLE "ord;ers" ( "sku,name" TEXT, note TEXT DEFAULT ';' );`);
  assert.equal(odd.tables[0].name, "ord;ers");
  assert.deepEqual(odd.tables[0].columns.map((column) => column.name), ["sku,name", "note"]);

  const checked = outlineSchema("CREATE TABLE t (id INT, CHECK (id IN (1, 2)));");
  assert.deepEqual(checked.tables[0].columns.map((column) => column.name), ["id"]);
  assert.match(checked.tables[0].constraints[0], /^CHECK \(id IN \(1, 2\)\)$/);

  const qualified = outlineSchema("CREATE TABLE IF NOT EXISTS main.products (id INT);");
  assert.equal(qualified.tables[0].name, "products");
});

test("a CREATE TABLE hidden in a string, comment or view is not invented", () => {
  const decoy = outlineSchema("CREATE TABLE real (id INT, note TEXT DEFAULT 'CREATE TABLE fake (x INT)');");
  assert.deepEqual(decoy.tables.map((table) => table.name), ["real"]);

  const commented = outlineSchema("-- CREATE TABLE fake (x INT)\nCREATE TABLE real (id INT);");
  assert.deepEqual(commented.tables.map((table) => table.name), ["real"]);

  const blocked = outlineSchema("/* CREATE TABLE fake (x INT) */ CREATE TABLE real (id INT);");
  assert.deepEqual(blocked.tables.map((table) => table.name), ["real"]);

  const view = outlineSchema("CREATE VIEW fake (x) AS SELECT 1; CREATE TABLE real (id INT);");
  assert.deepEqual(view.tables.map((table) => table.name), ["real"]);
});

test("hostile identifiers stay data and empty text is unparsed", () => {
  const name = "<img src=x onerror=alert(1)>";
  const hostile = outlineSchema(`CREATE TABLE "${name}" (id INT);`);
  assert.equal(hostile.tables[0].name, name);
  assert.equal(outlineSchema("").unparsed, true);
  assert.equal(outlineSchema("это не схема").tables.length, 0);
  assert.equal(outlineSchema("это не схема").unparsed, true);
});
