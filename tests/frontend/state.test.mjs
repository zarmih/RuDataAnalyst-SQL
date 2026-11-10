import assert from "node:assert/strict";
import test from "node:test";

import { formatDetail } from "../../src/rudataanalyst_sql/serve/static/js/api.js";
import { tokenizeSql } from "../../src/rudataanalyst_sql/serve/static/js/sql_text.js";
import {
  classifyResponse,
  reconcileDomain,
  safetyState,
} from "../../src/rudataanalyst_sql/serve/static/js/state.js";

const gen = {
  sql: "SELECT 1",
  explanation: "пояснение",
  assumptions: [],
  confidence: "high",
  is_safe: true,
  is_hallucinated: false,
  error: null,
};

test("missing safety is unknown, not passed or blocked", () => {
  assert.equal(safetyState({ sql: "SELECT 1" }), "unknown");
  assert.equal(safetyState({ sql: "SELECT 1", is_safe: true }), "structural_only");
  assert.equal(safetyState({ ...gen, is_safe: false }), "blocked");
  assert.equal(safetyState(gen), "passed");
});

test("generate success, blocked SQL and schema mismatch are different", () => {
  assert.equal(classifyResponse("generate", gen).phase, "result");
  assert.equal(classifyResponse("generate", { ...gen, is_safe: false }).phase, "blocked_sql");
  assert.equal(
    classifyResponse("generate", { ...gen, is_hallucinated: true }).phase,
    "schema_mismatch",
  );
  assert.equal(classifyResponse("generate", { detail: "domain_not_found" }).phase, "request_error");
});

test("query distinguishes rows, empty, truncated flag, timeout and unsafe", () => {
  const rows = classifyResponse("query", {
    generate_result: gen,
    query_result: { columns: ["n"], rows: [[1], [2]], truncated: true },
    query_error: null,
  });
  assert.equal(rows.phase, "result");
  assert.equal(rows.query.rows.length, 2);
  assert.equal(rows.query.truncated, true);

  const empty = classifyResponse("query", {
    generate_result: gen,
    query_result: { columns: ["n"], rows: [], truncated: false },
    query_error: null,
  });
  assert.equal(empty.phase, "result");
  assert.equal(empty.query.rows.length, 0);

  assert.equal(
    classifyResponse("query", {
      generate_result: { ...gen, is_safe: false },
      query_result: null,
      query_error: "unsafe_sql",
    }).phase,
    "blocked_sql",
  );
  assert.equal(
    classifyResponse("query", {
      generate_result: { ...gen, is_hallucinated: true },
      query_result: null,
      query_error: "schema_hallucination",
    }).phase,
    "schema_mismatch",
  );
  assert.equal(
    classifyResponse("query", {
      generate_result: gen,
      query_result: null,
      query_error: "query_timeout",
    }).errorCode,
    "query_timeout",
  );
  assert.equal(
    classifyResponse("query", { generate_result: gen, query_result: null, query_error: null }).phase,
    "request_error",
  );
});

test("a vanished domain is not replaced silently", () => {
  assert.deepEqual(reconcileDomain("warehouse", ["subscriptions"], ["local_sales"]), {
    domain: "",
    vanished: true,
  });
  assert.deepEqual(reconcileDomain("warehouse", ["warehouse"], []), {
    domain: "warehouse",
    vanished: false,
  });
  assert.deepEqual(reconcileDomain("", ["warehouse"], [], { allowInitial: true }), {
    domain: "warehouse",
    vanished: false,
  });
  assert.deepEqual(reconcileDomain("", ["warehouse"], []), {
    domain: "",
    vanished: false,
  });
});

test("FastAPI detail renders as a string and as a list", () => {
  assert.deepEqual(formatDetail("domain_not_found"), ["domain_not_found"]);
  assert.deepEqual(
    formatDetail([{ loc: ["body", "question"], msg: "Field required", type: "missing" }]),
    ["body.question: Field required"],
  );
});

test("SQL tokens round-trip hostile text without markup", () => {
  const sql = "SELECT '<script>alert(1)</script>', \"<img src=x onerror=alert(1)>\"";
  const tokens = tokenizeSql(sql);
  assert.equal(tokens.map((token) => token.text).join(""), sql);
  assert.equal(tokens.some((token) => token.text.includes("<script>")), true);
});
