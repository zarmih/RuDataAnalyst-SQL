import assert from "node:assert/strict";
import test from "node:test";

import { filterOutline } from "../../src/rudataanalyst_sql/serve/static/js/schema_filter.js";

const outline = {
  unparsed: false,
  tables: [
    {
      name: "products",
      columns: [
        { name: "id", detail: "INTEGER PRIMARY KEY" },
        { name: "name", detail: "TEXT NOT NULL" },
        { name: "price", detail: "NUMERIC" },
      ],
      constraints: ["UNIQUE (name)"],
    },
    {
      name: "inventory",
      columns: [
        { name: "product_id", detail: "INTEGER" },
        { name: "quantity", detail: "INTEGER" },
      ],
      constraints: ["FOREIGN KEY (product_id) REFERENCES products(id)"],
    },
    {
      name: "customers",
      columns: [
        { name: "id", detail: "INTEGER PRIMARY KEY" },
        { name: "email", detail: "TEXT" },
      ],
      constraints: ["CHECK (email LIKE '%@%')"],
    },
  ],
};

test("empty query keeps everything", () => {
  for (const query of ["", " ", "\n\t  ", null]) {
    const result = filterOutline(outline, query);
    assert.equal(result.unparsed, false);
    assert.equal(result.matched, outline.tables.length);
    assert.deepEqual(
      result.tables.map(({ name, columns, constraints }) => ({ name, columns, constraints })),
      outline.tables,
    );
    assert.deepEqual(result.tables.map((table) => table.hiddenColumns), [0, 0, 0]);
  }
});

test("price keeps the product table and only the price column", () => {
  const result = filterOutline(outline, "PrIcE");
  assert.equal(result.unparsed, false);
  assert.equal(result.matched, 1);
  assert.deepEqual(result.tables, [
    {
      name: "products",
      columns: [{ name: "price", detail: "NUMERIC" }],
      constraints: ["UNIQUE (name)"],
      hiddenColumns: 2,
    },
  ]);
  assert.equal(result.tables[0].columns[0].name, outline.tables[0].columns[2].name);
  assert.equal(result.tables[0].columns[0].detail, outline.tables[0].columns[2].detail);
});

test("a table-name hit keeps every column and hiddenColumns 0", () => {
  const result = filterOutline(outline, "CUSTOMERS");
  assert.equal(result.matched, 1);
  assert.equal(result.unparsed, false);
  assert.equal(result.tables[0].name, "customers");
  assert.deepEqual(result.tables[0].columns, outline.tables[2].columns);
  assert.deepEqual(result.tables[0].constraints, outline.tables[2].constraints);
  assert.equal(result.tables[0].hiddenColumns, 0);
});

test("regex-like query id) does not throw", () => {
  for (const query of ["id)", "ID)", "(?price", "pri.e", "price|name", "name+"]) {
    let result;
    assert.doesNotThrow(() => {
      result = filterOutline(outline, query);
    });
    assert.equal(result.unparsed, false);
  }
  const hit = filterOutline(outline, "id)");
  assert.equal(hit.matched, 1);
  assert.deepEqual(hit.tables.map((table) => table.name), ["inventory"]);
  assert.equal(hit.tables[0].hiddenColumns, 0);
  assert.deepEqual(hit.tables[0].columns, outline.tables[1].columns);
  assert.deepEqual(hit.tables[0].constraints, outline.tables[1].constraints);
  assert.equal(filterOutline(outline, "pri.e").matched, 0);
  assert.deepEqual(filterOutline(outline, "price|name").tables, []);
});

test("hostile names survive", () => {
  const name = `<script>alert("x")</script>`;
  const columnName = `a"b`;
  const detail = `TEXT '<img>'`;
  const constraint = `CHECK (note <> '<script>')`;
  const hostile = {
    unparsed: false,
    tables: [
      {
        name,
        columns: [
          { name: columnName, detail },
          { name: "other", detail: "INT" },
        ],
        constraints: [constraint],
      },
    ],
  };

  const byName = filterOutline(hostile, "script");
  assert.equal(byName.tables[0].name, name);
  assert.equal(byName.tables[0].hiddenColumns, 0);
  assert.equal(byName.tables[0].columns[0].name, columnName);
  assert.equal(byName.tables[0].columns[0].detail, detail);
  assert.equal(byName.tables[0].constraints[0], constraint);
  assert.equal(byName.tables[0].columns.length, 2);

  const byColumn = filterOutline(hostile, `a"b`);
  assert.equal(byColumn.matched, 1);
  assert.equal(byColumn.tables[0].name, name);
  assert.equal(byColumn.tables[0].hiddenColumns, 1);
  assert.deepEqual(byColumn.tables[0].columns, [{ name: columnName, detail }]);
  assert.deepEqual(byColumn.tables[0].constraints, [constraint]);
  assert.equal(JSON.stringify(byColumn).includes("&lt;"), false);
  assert.equal(JSON.stringify(byColumn).includes("&quot;"), false);
});

test("no match returns no tables and does not mark a parsed outline unparsed", () => {
  const result = filterOutline(outline, "zzzz-not-here");
  assert.deepEqual(result.tables, []);
  assert.equal(result.matched, 0);
  assert.equal(result.unparsed, false);
});

test("a missing outline is unparsed", () => {
  const empty = { tables: [], unparsed: true, matched: 0 };
  assert.deepEqual(filterOutline(null, "price"), empty);
  assert.deepEqual(filterOutline(undefined, ""), empty);
  assert.deepEqual(filterOutline({}, "price"), empty);
  assert.deepEqual(filterOutline({ tables: null, unparsed: false }, "x"), empty);
  assert.deepEqual(filterOutline({ tables: "products", unparsed: false }, ""), empty);
});
