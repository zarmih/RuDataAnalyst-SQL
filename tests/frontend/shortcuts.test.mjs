import assert from "node:assert/strict";
import test from "node:test";

import { SHORTCUTS, matchShortcut } from "../../src/rudataanalyst_sql/serve/static/js/shortcuts.js";

function press(key, modifiers = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

test("SHORTCUTS is a help list with Russian labels and key hints", () => {
  assert.deepEqual(
    SHORTCUTS.map((item) => ({ id: item.id, label: item.label, keys: item.keys })),
    [
      {
        id: "query",
        label: "Сгенерировать и выполнить",
        keys: "Ctrl+Enter или ⌘+Enter",
      },
      {
        id: "generate",
        label: "Только SQL",
        keys: "Ctrl+Shift+Enter или ⌘+Shift+Enter",
      },
      {
        id: "cancel",
        label: "Прекратить ожидание",
        keys: "Escape",
      },
      {
        id: "pin",
        label: "Закрепить или снять закрепление",
        keys: "Ctrl+Shift+P или ⌘+Shift+P",
      },
      {
        id: "schema",
        label: "Показать схему базы",
        keys: "Ctrl+Shift+S или ⌘+Shift+S",
      },
    ],
  );
});

test("query is Ctrl or Meta plus Enter, without Shift", () => {
  assert.equal(matchShortcut(press("Enter", { ctrlKey: true })), "query");
  assert.equal(matchShortcut(press("Enter", { metaKey: true })), "query");
  assert.equal(matchShortcut(press("Enter", { ctrlKey: true, metaKey: true })), "query");
});

test("generate is Ctrl or Meta plus Shift plus Enter", () => {
  assert.equal(matchShortcut(press("Enter", { ctrlKey: true, shiftKey: true })), "generate");
  assert.equal(matchShortcut(press("Enter", { metaKey: true, shiftKey: true })), "generate");
  assert.equal(
    matchShortcut(press("Enter", { ctrlKey: true, metaKey: true, shiftKey: true })),
    "generate",
  );
});

test("cancel is Escape or Esc with no modifiers", () => {
  assert.equal(matchShortcut(press("Escape")), "cancel");
  assert.equal(matchShortcut(press("Esc")), "cancel");
  assert.equal(matchShortcut(press("Escape", { ctrlKey: true })), null);
  assert.equal(matchShortcut(press("Escape", { metaKey: true })), null);
  assert.equal(matchShortcut(press("Escape", { shiftKey: true })), null);
});

test("pin accepts Latin p and Russian з, schema accepts s and ы", () => {
  for (const key of ["p", "P", "з", "З"]) {
    assert.equal(matchShortcut(press(key, { ctrlKey: true, shiftKey: true })), "pin", key);
    assert.equal(matchShortcut(press(key, { metaKey: true, shiftKey: true })), "pin", key);
  }
  for (const key of ["s", "S", "ы", "Ы"]) {
    assert.equal(matchShortcut(press(key, { ctrlKey: true, shiftKey: true })), "schema", key);
    assert.equal(matchShortcut(press(key, { metaKey: true, shiftKey: true })), "schema", key);
  }
  assert.equal(matchShortcut(press("p", { ctrlKey: true, metaKey: true, shiftKey: true })), "pin");
  assert.equal(matchShortcut(press("ы", { ctrlKey: true, metaKey: true, shiftKey: true })), "schema");
  assert.equal(matchShortcut(press("p", { ctrlKey: true })), null);
  assert.equal(matchShortcut(press("s", { shiftKey: true })), null);
});

test("Alt suppresses every shortcut", () => {
  assert.equal(matchShortcut(press("Enter", { ctrlKey: true, altKey: true })), null);
  assert.equal(matchShortcut(press("Enter", { metaKey: true, shiftKey: true, altKey: true })), null);
  assert.equal(matchShortcut(press("Escape", { altKey: true })), null);
  assert.equal(matchShortcut(press("з", { ctrlKey: true, shiftKey: true, altKey: true })), null);
  assert.equal(matchShortcut(press("ы", { metaKey: true, shiftKey: true, altKey: true })), null);
  assert.equal(matchShortcut(press("P", { ctrlKey: true, metaKey: true, shiftKey: true, altKey: true })), null);
});

test("bare Enter and Shift+Enter are not query or generate", () => {
  assert.equal(matchShortcut(press("Enter")), null);
  assert.equal(matchShortcut(press("Enter", { shiftKey: true })), null);
  assert.equal(matchShortcut(press("Enter", { altKey: true })), null);
});
