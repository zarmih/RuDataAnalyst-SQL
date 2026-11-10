import assert from "node:assert/strict";
import test from "node:test";

import { checkTables } from "../../src/rudataanalyst_sql/serve/static/js/schema_check.js";

const outline = {
  tables: [
    { name: "products" },
    { name: "inventory" },
  ],
};

test("no outline is unchecked and does not guess", () => {
  for (const missing of [null, undefined, {}, { tables: null }, { tables: "products" }, "products"]) {
    assert.deepEqual(checkTables(["products", "missing"], missing), {
      checked: false,
      items: [],
    });
  }
  assert.deepEqual(checkTables(["products"]), { checked: false, items: [] });
});

test("an empty tables array is checked and invents nothing", () => {
  assert.deepEqual(checkTables(["products"], { tables: [] }), {
    checked: true,
    items: [{ name: "products", found: false }],
  });
  assert.deepEqual(checkTables([], { tables: [] }), { checked: true, items: [] });
});

test("a real outline with no names is checked and empty", () => {
  assert.deepEqual(checkTables([], outline), { checked: true, items: [] });
});

test("table names match case-insensitively and keep caller order", () => {
  assert.deepEqual(checkTables(["Products", "INVENTORY", "products"], outline), {
    checked: true,
    items: [
      { name: "Products", found: true },
      { name: "INVENTORY", found: true },
      { name: "products", found: true },
    ],
  });
  assert.deepEqual(
    checkTables(["orders"], { tables: [{ name: "Orders" }] }).items,
    [{ name: "orders", found: true }],
  );
});

test("a name absent from the outline is not found", () => {
  assert.deepEqual(checkTables(["shipments", "products"], outline), {
    checked: true,
    items: [
      { name: "shipments", found: false },
      { name: "products", found: true },
    ],
  });
});

test("a hostile name is compared literally and returned unchanged", () => {
  const hostile = "<script>";
  assert.deepEqual(checkTables([hostile, "Products"], outline), {
    checked: true,
    items: [
      { name: hostile, found: false },
      { name: "Products", found: true },
    ],
  });
  assert.deepEqual(checkTables([hostile], { tables: [{ name: hostile }] }), {
    checked: true,
    items: [{ name: hostile, found: true }],
  });
});

test("non-string names are ignored", () => {
  assert.deepEqual(
    checkTables([1, null, undefined, { name: "products" }, "Products", false, "nope"], outline),
    {
      checked: true,
      items: [
        { name: "Products", found: true },
        { name: "nope", found: false },
      ],
    },
  );
});
