import assert from "node:assert/strict";
import test from "node:test";

import { explainServerMessage } from "../../src/rudataanalyst_sql/serve/static/js/server_message.js";

test("known guardrail messages keep the server text and add Russian", () => {
  const empty = explainServerMessage("Empty SQL");
  assert.equal(empty.ru, "Модель не вернула SQL.");
  assert.equal(empty.raw, "Empty SQL");

  const unsafe = explainServerMessage("Unsafe or non-SELECT SQL detected.");
  assert.match(unsafe.ru, /один читающий запрос SELECT/);
  assert.equal(unsafe.raw, "Unsafe or non-SELECT SQL detected.");

  const several = explainServerMessage("Multiple SQL statements are not allowed.");
  assert.match(several.ru, /Несколько операторов/);

  const missing = explainServerMessage("Schema hallucination: no such table: orders");
  assert.match(missing.ru, /нет в схеме/);
  assert.equal(missing.raw, "Schema hallucination: no such table: orders");
});

test("an unknown server message is not translated into a verdict", () => {
  const unknown = explainServerMessage("attempt to write a readonly database");
  assert.equal(unknown.ru, "");
  assert.equal(unknown.raw, "attempt to write a readonly database");
  assert.equal(explainServerMessage(""), null);
  assert.equal(explainServerMessage(null), null);
});
