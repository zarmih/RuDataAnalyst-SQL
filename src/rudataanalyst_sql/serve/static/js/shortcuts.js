export const SHORTCUTS = [
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
];

// JCUKEN: Shift+P/S yields З/Ы, not the Latin letter. Match either case.
const PIN_LETTERS = new Set(["p", "з"]);
const SCHEMA_LETTERS = new Set(["s", "ы"]);

export function matchShortcut(eventLike) {
  if (!eventLike || typeof eventLike.key !== "string") return null;
  if (eventLike.altKey) return null;
  const { key } = eventLike;
  const command = Boolean(eventLike.ctrlKey || eventLike.metaKey);
  const shift = Boolean(eventLike.shiftKey);

  if (key === "Enter") {
    if (!command) return null;
    return shift ? "generate" : "query";
  }
  if ((key === "Escape" || key === "Esc") && !command && !shift) return "cancel";
  if (!command || !shift) return null;
  const letter = key.toLowerCase();
  if (PIN_LETTERS.has(letter)) return "pin";
  if (SCHEMA_LETTERS.has(letter)) return "schema";
  return null;
}
