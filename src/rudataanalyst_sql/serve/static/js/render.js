import { tablesInSql } from "./sql_names.js";
import { checkTables } from "./schema_check.js";
import { columnProfile, profileLine } from "./column_profile.js";
import { answerDigest } from "./answer_digest.js";
import { explainServerMessage } from "./server_message.js";
import { filterOutline } from "./schema_filter.js";
import { diffSql } from "./sql_diff.js";
import { outlineSchema } from "./schema_outline.js";
import { tokenizeSql } from "./sql_text.js";
import { safetyState, countNoun, shownRowLimit } from "./state.js";
import { explainDetailLine, formatDetail } from "./api.js";
import { CSV_NULL_POLICY } from "./csv.js";

function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text != null) node.textContent = String(props.text);
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value != null && value !== false) node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    if (typeof child === "string" || typeof child === "number") node.append(document.createTextNode(String(child)));
    else node.append(child);
  }
  return node;
}

function paintSql(code, sql) {
  code.replaceChildren();
  for (const token of tokenizeSql(sql)) {
    if (token.type === "plain") {
      code.append(document.createTextNode(token.text));
      continue;
    }
    const span = document.createElement("span");
    span.className = `tok-${token.type}`;
    span.textContent = token.text;
    code.append(span);
  }
}

function labeledLine(label, value) {
  const p = h("p", { className: "kv" });
  p.append(h("span", { className: "k", text: label }));
  p.append(document.createTextNode(" "));
  p.append(h("span", { text: value }));
  return p;
}

function sourceLabel(source) {
  if (source === "built_in") return "встроенная";
  if (source === "managed") return "зарегистрированная";
  return "источник не сохранён";
}

function modeLabel(mode) {
  return mode === "generate" ? "Только SQL" : "Сгенерировать и выполнить";
}

function contextBlock(view) {
  const box = h("div", { className: "snapshot" });
  box.append(labeledLine("База", `${view.domain} (${sourceLabel(view.domainSource)})`));
  box.append(labeledLine("Вопрос", view.question || ""));
  box.append(labeledLine("Режим", modeLabel(view.mode)));
  box.append(h("p", { className: "fine", text: "Это снимок отправленного запроса. Смена полей формы его не переписывает." }));
  return box;
}

function sqlBlock(gen, outline) {
  const box = h("section", { attrs: { "aria-label": "Сгенерированный SQL" } });
  box.append(h("h3", { text: "SQL" }));
  if (!gen || typeof gen.sql !== "string") {
    box.append(h("p", { text: "SQL пришёл в неожиданном виде и не показан." }));
    return box;
  }
  if (!gen.sql.trim()) {
    box.append(h("p", { text: "Модель не вернула SQL." }));
    return box;
  }
  const pre = h("pre", { className: "sql-scroll", attrs: { tabindex: "0", "aria-label": "Текст SQL" } });
  const code = document.createElement("code");
  paintSql(code, gen.sql);
  pre.append(code);
  box.append(pre);
  const row = h("div", { className: "row-actions" });
  row.append(h("button", {
    className: "btn secondary",
    text: "Копировать SQL",
    attrs: { type: "button", "data-action": "copy-sql" },
  }));
  row.append(h("span", { className: "copy-status", attrs: { role: "status" } }));
  box.append(row);
  if (typeof gen.latency === "number" && Number.isFinite(gen.latency)) {
    box.append(h("p", { className: "fine", text: `Время генерации на сервере: ${gen.latency.toFixed(2)} с. Это не оценка качества.` }));
  }
  const names = tablesInSql(gen.sql);
  const check = checkTables(names, outline);
  if (check.checked && check.items.length > 0) {
    const list = h("ul", { className: "schema-check fine" });
    for (const item of check.items) {
      const line = item.found
        ? `Таблица «${item.name}» найдена в загруженной схеме базы.`
        : `Таблица «${item.name}» отсутствует в загруженной схеме базы. Это только сверка списка, не ошибка выполнения.`;
      list.append(h("li", { text: line }));
    }
    box.append(list);
  }
  return box;
}

function explanationBlock(gen) {
  const box = h("section", { attrs: { "aria-label": "Объяснение" } });
  box.append(h("h3", { text: "Объяснение" }));
  if (!gen || typeof gen.explanation !== "string") {
    box.append(h("p", { text: "Объяснение пришло в неожиданном виде и не показано." }));
  } else if (!gen.explanation.trim()) {
    box.append(h("p", { text: "Объяснение не передано." }));
  } else {
    box.append(h("p", { className: "prose", text: gen.explanation }));
  }
  return box;
}

function assumptionsBlock(gen) {
  if (!gen || !Object.prototype.hasOwnProperty.call(gen, "assumptions") || gen.assumptions == null) return null;
  if (!Array.isArray(gen.assumptions)) {
    return h("p", { text: "Допущения пришли в неожиданном виде и не показаны." });
  }
  const items = gen.assumptions.filter((item) => typeof item === "string" && item.trim());
  if (!items.length) return null;
  const box = h("section", { attrs: { "aria-label": "Допущения" } });
  box.append(h("h3", { text: "Допущения" }));
  const list = h("ul", { className: "assumptions" });
  for (const item of items) list.append(h("li", { text: item }));
  box.append(list);
  return box;
}

function safetyBlock(gen) {
  const safety = safetyState(gen);
  let title = "Статус ограничений неизвестен";
  let text = "Нельзя считать запрос ни прошедшим проверку, ни заблокированным.";
  let tone = "meter-unknown";
  if (safety === "passed") {
    title = "Ограничения пройдены";
    text = "Запрос прошёл существующие ограничения сервера: один SELECT и имена, которые нашлись в схеме. Это не гарантия смысловой правильности.";
    tone = "meter-passed";
  } else if (safety === "blocked") {
    title = "SQL заблокирован ограничениями";
    text = "Серверные ограничения не пропустили запрос. Это отдельный статус, не самооценка модели.";
    tone = "meter-blocked";
  } else if (safety === "schema_mismatch") {
    title = "Схема не совпала";
    text = "Запрос ссылается на объекты, которых нет в схеме. Это не блокировка опасного SQL и не таймаут.";
    tone = "meter-mismatch";
  } else if (safety === "structural_only") {
    title = "Схема не подтверждена";
    text = "Структурный признак есть, но проверка схемы не пришла булевым значением. Общий вердикт не ставится.";
    tone = "meter-unknown";
  }
  const block = h("section", { className: `meter ${tone}`, attrs: { "aria-label": "Проверка ограничений" } });
  block.append(h("h3", { text: title }));
  block.append(h("p", { text }));
  appendServerMessage(block, gen && gen.error);
  return block;
}

function appendServerMessage(parent, error) {
  const explained = explainServerMessage(error);
  if (!explained) return;
  if (explained.ru) parent.append(h("p", { text: explained.ru }));
  else parent.append(h("p", { text: "Сервер прислал сообщение без отдельного перевода." }));
  parent.append(h("p", { className: "fine", text: explained.raw }));
}

function confidenceBlock(gen) {
  const labels = { high: "высокая", medium: "средняя", low: "низкая" };
  const known = gen && typeof gen.confidence === "string" ? labels[gen.confidence] : "";
  const block = h("section", { className: "meter meter-confidence", attrs: { "aria-label": "Самооценка модели" } });
  block.append(h("h3", { text: "Самооценка модели" }));
  block.append(h("p", { text: known ? `Уровень: ${known}.` : "Уровень не указан." }));
  block.append(h("p", { className: "fine", text: "Это самооценка модели: high, medium или low. Не калиброванная вероятность и не оценка правильности SQL." }));
  return block;
}

function meters(gen) {
  const wrap = h("div", { className: "meters" });
  wrap.append(safetyBlock(gen));
  wrap.append(confidenceBlock(gen));
  return wrap;
}

const LONG_CELL = 80;

function renderValue(value, key, expanded) {
  if (value === null || value === undefined) {
    return h("span", { className: "v-null", text: "NULL", attrs: { title: "Значение NULL", "aria-label": "значение NULL" } });
  }
  if (value === "") {
    return h("span", { className: "v-empty", text: "пустая строка", attrs: { "aria-label": "пустая строка" } });
  }
  if (value === false) {
    return h("span", { className: "v-bool", text: "false", attrs: { "aria-label": "логическое false" } });
  }
  if (value === true) {
    return h("span", { className: "v-bool", text: "true", attrs: { "aria-label": "логическое true" } });
  }
  if (typeof value === "number") {
    return h("span", { className: "v-num", text: String(value), attrs: { "aria-label": `число ${value}` } });
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const isLong = text.length > LONG_CELL || text.includes("\n");
  if (!isLong) return h("span", { text });
  const open = expanded.has(key);
  const wrap = h("div", { className: "cell-long" });
  wrap.append(h("span", { text: open ? text : `${text.slice(0, LONG_CELL)}…` }));
  wrap.append(h("button", {
    className: "text-btn",
    text: open ? "Свернуть" : "Показать полностью",
    attrs: {
      type: "button",
      "data-action": "toggle-cell",
      "data-key": key,
      "aria-expanded": open ? "true" : "false",
    },
  }));
  wrap.append(h("button", {
    className: "text-btn",
    text: "Копировать значение",
    attrs: { type: "button", "data-action": "copy-cell", "data-key": key },
  }));
  return wrap;
}

function compareCells(left, right) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "ru", { numeric: true, sensitivity: "base" });
}

function orderedRows(rows, sort) {
  const indexed = rows.map((row, index) => ({ row: Array.isArray(row) ? row : null, index }));
  if (!sort || sort.column == null) return indexed;
  const direction = sort.dir === "desc" ? -1 : 1;
  const column = sort.column;
  indexed.sort((a, b) => {
    if (!a.row || !b.row) return a.index - b.index;
    const av = a.row[column];
    const bv = b.row[column];
    if (av == null && bv == null) return a.index - b.index;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = compareCells(av, bv);
    if (cmp === 0) return a.index - b.index;
    return cmp * direction;
  });
  return indexed;
}

function sampleCaption(query) {
  const count = query.rows.length;
  const noun = countNoun(count, "строка", "строки", "строк");
  if (query.truncated === true) {
    const limit = shownRowLimit(query);
    const cap = limit ? ` Сервер отдаёт не больше ${limit}.` : "";
    return `Показаны первые ${count} ${noun}; результат ограничен сервером.${cap}`;
  }
  if (query.truncated === false) {
    return `Получено ${count} ${noun}. Это размер показанного ответа, а не число записей в базе.`;
  }
  return `Загружено ${count} ${noun}. Сервер не сообщил, полный ли это результат.`;
}

function exportNote(query) {
  if (query.truncated === true) {
    const limit = shownRowLimit(query);
    const cap = limit ? ` Сервер отдаёт не больше ${limit}.` : "";
    return `Экспорт содержит только показанную часть. Результат на сервере ограничен.${cap}`;
  }
  if (query.truncated === false) {
    return "Экспорт содержит все строки этого ответа. Число строк не является размером базы.";
  }
  return "Сервер не сообщил, полный ли ответ. Экспорт содержит только загруженные строки.";
}

function renderTable(view) {
  const query = view.query;
  const wrap = h("div", { className: "result-block" });
  wrap.append(h("p", { className: "sample-note", text: sampleCaption(query) }));
  if (query.rows.length === 0 && query.truncated !== true) {
    wrap.append(h("h3", { text: "Запрос выполнен, строк нет" }));
    wrap.append(h("p", { text: "Сервер выполнил запрос и вернул пустой набор. Это не ошибка сети и не блокировка SQL." }));
  } else {
    wrap.append(h("h3", { text: "Результат" }));
    wrap.append(h("p", { className: "fine", text: "Сортировка по заголовку относится только к полученным строкам. NULL остаётся внизу. CSV сохраняет порядок ответа сервера." }));
    const profile = h("ul", { className: "profile" });
    for (const stat of columnProfile(query.columns, query.rows)) {
      const line = profileLine(stat);
      if (line) profile.append(h("li", { text: line }));
    }
    if (profile.childNodes.length) wrap.append(profile);
    const scroller = h("div", { className: "table-scroll", attrs: { tabindex: "0", "aria-label": "Прокрутка таблицы" } });
    const table = h("table");
    const caption = h("caption", { className: "sr-only", text: sampleCaption(query) });
    table.append(caption);
    const thead = h("thead");
    const headRow = h("tr");
    query.columns.forEach((column, index) => {
      const th = h("th", { attrs: { scope: "col" } });
      if (view.sort?.column === index) th.setAttribute("aria-sort", view.sort.dir === "desc" ? "descending" : "ascending");
      th.append(h("button", {
        className: "sort-btn",
        text: String(column),
        attrs: { type: "button", "data-action": "sort", "data-col": String(index) },
      }));
      headRow.append(th);
    });
    thead.append(headRow);
    table.append(thead);
    const tbody = h("tbody");
    for (const item of orderedRows(query.rows, view.sort)) {
      const tr = h("tr");
      if (!item.row) {
        const td = h("td", { text: "Строка неожиданного вида", attrs: { colspan: String(Math.max(query.columns.length, 1)) } });
        tr.append(td);
      } else {
        query.columns.forEach((_, index) => {
          const key = `${item.index}:${index}`;
          const td = h("td");
          td.append(renderValue(item.row[index], key, view.expanded));
          tr.append(td);
        });
      }
      tbody.append(tr);
    }
    table.append(tbody);
    scroller.append(table);
    wrap.append(scroller);
  }
  const exportBox = h("div", { className: "export-box" });
  exportBox.append(h("button", {
    className: "btn secondary",
    text: "Экспорт CSV",
    attrs: { type: "button", "data-action": "export-csv" },
  }));
  exportBox.append(h("p", { text: exportNote(query) }));
  exportBox.append(h("p", { className: "fine", text: CSV_NULL_POLICY }));
  wrap.append(exportBox);
  return wrap;
}

function renderGenerating(ticket) {
  const box = h("div", { className: "waiting" });
  box.append(h("h3", { text: "Генерация выполняется" }));
  box.append(h("p", { text: "Достоверного процента готовности нет. Пока модель загружается в память, шкала тоже не отражает долю работы." }));
  const track = h("div", { className: "track", attrs: { role: "progressbar", "aria-valuetext": "Генерация выполняется, доля неизвестна" } });
  track.append(h("div", { className: "indeterminate" }));
  box.append(track);
  box.append(h("p", { attrs: { id: "elapsed" }, text: "Прошло 0 с." }));
  box.append(labeledLine("База", ticket.domain));
  box.append(labeledLine("Вопрос", ticket.question));
  box.append(labeledLine("Режим", modeLabel(ticket.mode)));
  box.append(h("p", { className: "fine", text: "Правка поля вопроса не меняет уже отправленный запрос." }));
  return box;
}

function renderRequestError(view) {
  const error = view.error || { kind: "invalid_shape", status: null, lines: [] };
  const titles = {
    network: "Не удалось отправить запрос",
    timeout: "Время ожидания истекло",
    aborted: "Ожидание прекращено",
    http: "Запрос отклонён сервером",
    invalid_json: "Модель не ответила",
    invalid_shape: "Модель не ответила",
  };
  const box = h("div", { className: "request-error" });
  box.append(contextBlock(view));
  box.append(h("h3", { text: titles[error.kind] || "Ошибка запроса" }));
  if (error.kind === "network") {
    box.append(h("p", { text: "Браузер не смог связаться с локальным API. Это не оценка SQL. Повтора не было." }));
  } else if (error.kind === "timeout") {
    box.append(h("p", { text: "Прервано ожидание в браузере. Вычисления на сервере могли продолжиться. Повтора не было." }));
  } else if (error.kind === "invalid_json" || error.kind === "invalid_shape") {
    box.append(h("p", { text: "Ответ не удалось принять как результат генерации. Статус SQL неизвестен, и он не показан как безопасный или опасный." }));
  } else if (error.kind === "http") {
    box.append(h("p", { text: `Сервер ответил HTTP ${error.status ?? "без кода"}. Это не статус проверки SQL.` }));
  }
  if (error.lines?.length) {
    const list = h("ul");
    for (const line of error.lines) list.append(h("li", { text: explainDetailLine(line) }));
    box.append(list);
  }
  if (error.kind !== "aborted") {
    box.append(h("button", {
      className: "btn secondary",
      text: "Повторить отправку",
      attrs: { type: "button", "data-action": "retry" },
    }));
  }
  return box;
}

function answerActions(view) {
  const row = h("div", { className: "row-actions" });
  row.append(h("button", {
    className: "btn secondary",
    text: "Скопировать ответ",
    attrs: { type: "button", "data-action": "copy-answer" },
  }));
  if (view.phase === "blocked_sql" || view.phase === "schema_mismatch") {
    row.append(h("button", {
      className: "btn secondary",
      text: "Показать схему этой базы",
      attrs: { type: "button", "data-action": "show-schema", "data-domain": view.domain || "" },
    }));
  }
  return row;
}

function renderAnswerBody(view, outline) {
  const box = h("div", { className: "answer-body" });
  if (view.phase === "request_error") {
    box.append(answerActions(view));
    box.append(renderRequestError(view));
    return box;
  }
  box.append(contextBlock(view));
  box.append(answerActions(view));
  box.append(sqlBlock(view.gen, outline));
  box.append(explanationBlock(view.gen));
  const assumptions = assumptionsBlock(view.gen);
  if (assumptions) box.append(assumptions);
  box.append(meters(view.gen));
  if (view.phase === "blocked_sql") {
    box.append(h("h3", { text: "SQL заблокирован" }));
    box.append(h("p", { text: "Запрос не выполнялся. Показанный SQL сервер не запускал." }));
    return box;
  }
  if (view.phase === "schema_mismatch") {
    box.append(h("h3", { text: "SQL не соответствует схеме" }));
    box.append(h("p", { text: "Запрос не выполнялся. Это другой статус, чем блокировка SQL и чем таймаут выполнения." }));
    return box;
  }
  if (view.phase === "execution_error") {
    if (view.errorCode === "query_timeout") {
      box.append(h("h3", { text: "Выполнение прервано по времени" }));
      box.append(h("p", { text: "Сервер остановил уже допущенный запрос по собственному таймауту. Это не блокировка SQL и не ошибка сети." }));
    } else {
      box.append(h("h3", { text: "Ошибка выполнения" }));
      appendServerMessage(box, view.errorCode);
      if (!explainServerMessage(view.errorCode)) {
        box.append(h("p", { text: view.errorCode || "Сервер не вернул строки." }));
      }
    }
    return box;
  }
  if (view.mode === "generate" || !view.query) {
    box.append(h("h3", { text: "SQL без выполнения" }));
    box.append(h("p", { text: "Запрос не выполнялся: режим «Только SQL». Кнопки, которая запускает уже показанный текст, нет: выполнение на сервере заново генерирует SQL из вопроса." }));
    return box;
  }
  box.append(renderTable(view));
  return box;
}

function renderPane(view, scope, outline) {
  const pin = scope === "pin";
  const pane = h("section", {
    className: pin ? "pane pane-pin" : "pane pane-current",
    attrs: {
      "data-scope": scope,
      "aria-label": pin ? "Закреплённый ответ" : "Текущий ответ",
    },
  });
  const head = h("div", { className: "pane-head" });
  if (pin) {
    const digest = answerDigest(view);
    head.append(h("h3", { text: "Закреплённый ответ" }));
    const digestLine = [digest.safetyLabel, `Самооценка: ${digest.confidenceLabel}`, digest.rowLabel].filter(Boolean).join(". ");
    head.append(h("p", {
      className: "fine",
      text: digestLine.endsWith(".") ? digestLine : `${digestLine}.`,
    }));
    head.append(h("button", {
      className: "btn secondary",
      text: "Снять закрепление",
      attrs: { type: "button", "data-action": "unpin" },
    }));
    head.append(h("p", { className: "fine", text: "Снимок этой вкладки. Новая генерация его не заменяет и на диск он не пишется." }));
  } else {
    head.append(h("button", {
      className: "btn secondary",
      text: "Закрепить этот ответ",
      attrs: { type: "button", "data-action": "pin" },
    }));
  }
  pane.append(head);
  pane.append(renderAnswerBody(view, outline));
  return pane;
}

export function renderOutcome(state) {
  const root = document.getElementById("outcome");
  root.replaceChildren();
  const pinned = state.pinned || null;
  const getOutline = (v) => {
    if (!state.schemaView || state.schemaView.status !== "ready" || !state.schemaView.text) return null;
    if (v?.domain && state.schemaView.domain !== v.domain) return null;
    return outlineSchema(state.schemaView.text);
  };
  if (state.inflight) {
    root.dataset.phase = "generating";
    root.setAttribute("aria-busy", "true");
    const wrap = h("div", { className: pinned ? "compare" : "compare compare-single" });
    if (pinned) wrap.append(renderPane(pinned, "pin", getOutline(pinned)));
    wrap.append(renderGenerating(state.inflight));
    root.append(wrap);
    return;
  }
  root.setAttribute("aria-busy", "false");
  if (!state.view && !pinned) {
    root.dataset.phase = state.phase || "ready";
    root.append(h("p", { className: "idle", text: "Здесь появится SQL, статус ограничений и результат. Пока запрос не отправлен." }));
    return;
  }
  root.dataset.phase = state.view?.phase || "ready";
  const wrap = h("div", { className: pinned && state.view ? "compare" : "compare compare-single" });
  const diff = pinned && state.view ? renderSqlDiff(pinned, state.view) : null;
  if (diff) wrap.append(diff);
  if (pinned) wrap.append(renderPane(pinned, "pin", getOutline(pinned)));
  if (state.view) wrap.append(renderPane(state.view, "current", getOutline(state.view)));
  root.append(wrap);
}

export function renderDomainOptions(select, builtIn, managed, selected) {
  select.replaceChildren();
  select.append(new Option("Выберите базу", ""));
  const addGroup = (label, ids) => {
    if (!ids.length) return;
    const group = document.createElement("optgroup");
    group.label = label;
    for (const id of ids) group.append(new Option(id, id));
    select.append(group);
  };
  addGroup("Встроенные", builtIn);
  addGroup("Зарегистрированные", managed);
  const known = [...builtIn, ...managed];
  select.value = selected && known.includes(selected) ? selected : "";
}

export function renderDomainStatus(domains, showError) {
  const box = document.getElementById("domains-status");
  const retry = document.getElementById("btn-retry-domains");
  box.replaceChildren();
  const total = domains.built_in.length + domains.managed.length;
  if (showError && total === 0) {
    box.append(h("p", { text: "Не удалось загрузить список баз. Вопрос в поле сохранён." }));
    retry.hidden = false;
    return;
  }
  retry.hidden = !showError;
  if (showError) {
    box.append(h("p", { text: "Не удалось обновить список баз. Прежний список и вопрос сохранены." }));
  }
  if (total === 0) {
    box.append(h("p", { text: "Нет доступных баз. Встроенные файлы не найдены, зарегистрированных тоже нет." }));
    const pre = h("pre", { className: "sql-scroll" });
    pre.append(h("code", { text: "uv run python -m src.rudataanalyst_sql.serve.cli schema add-sqlite --id mydb --db /path/to/my/data.sqlite" }));
    box.append(pre);
    box.append(h("p", { className: "fine", text: "Команда копирует базу в локальный реестр. Браузер путь к файлу не отправляет." }));
    return;
  }
  box.append(h("p", { className: "fine", text: "Встроенные базы идут с демонстрацией. Зарегистрированные добавлены локально и стоят отдельной группой." }));
}

function insertButton(name) {
  return h("button", {
    className: "text-btn",
    text: `Вставить ${name}`,
    attrs: { type: "button", "data-action": "insert-name", "data-name": name },
  });
}

function askButton(table, column) {
  const label = column ? `Вопрос: ${table}.${column}` : `Вопрос: ${table}`;
  return h("button", {
    className: "text-btn",
    text: label,
    attrs: {
      type: "button",
      "data-action": "ask-name",
      "data-table": table,
      "data-column": column || "",
    },
  });
}

function renderSqlDiff(pinned, current) {
  const before = pinned?.gen && typeof pinned.gen.sql === "string" ? pinned.gen.sql : null;
  const after = current?.gen && typeof current.gen.sql === "string" ? current.gen.sql : null;
  if (before == null || after == null) return null;
  const box = h("section", { className: "diff-block", attrs: { "aria-label": "Сравнение SQL" } });
  box.append(h("h3", { text: "Сравнение SQL" }));
  if (before === after) {
    box.append(h("p", { text: "Закреплённый и текущий SQL совпадают. Это не выполнение." }));
    return box;
  }
  box.append(h("p", { className: "fine", text: "Минус — строка закреплённого ответа, плюс — строка текущего. Запрос не выполняется." }));
  box.append(h("button", {
    className: "btn secondary",
    text: "Скопировать сравнение",
    attrs: { type: "button", "data-action": "copy-diff" },
  }));
  const lines = h("div", { className: "sql-scroll diff-lines", attrs: { tabindex: "0" } });
  for (const line of diffSql(before, after)) {
    const prefix = line.type === "remove" ? "- " : line.type === "add" ? "+ " : "  ";
    lines.append(h("div", { className: `diff-line diff-${line.type}`, text: `${prefix}${line.text}` }));
  }
  box.append(lines);
  return box;
}

function renderOutline(sql, filterText) {
  const outline = outlineSchema(sql);
  const filtered = filterOutline(outline, filterText);
  const box = h("div");
  if (outline.unparsed) {
    box.append(h("p", { text: "Таблицы из этого текста не разобраны. Ниже исходный DDL. Имена не подставлены." }));
    return box;
  }
  if (filtered.matched === 0) {
    box.append(h("p", { text: "В списке ничего не найдено. Таблицы не подставлены. Ниже полный DDL." }));
    return box;
  }
  box.append(h("p", { className: "fine", text: "Список разобран из DDL сервера. Связи, которых нет в тексте, не добавляются." }));
  const list = h("ul", { className: "schema-tables" });
  for (const table of filtered.tables) {
    const item = h("li");
    const head = h("div", { className: "schema-line" });
    head.append(h("span", { className: "k", text: table.name }));
    head.append(insertButton(table.name));
    head.append(askButton(table.name));
    item.append(head);
    if (table.columns.length) {
      const columns = h("ul");
      for (const column of table.columns) {
        const line = h("li", { className: "schema-line" });
        line.append(h("span", { text: column.name }));
        if (column.detail) line.append(h("span", { className: "fine", text: column.detail }));
        line.append(insertButton(column.name));
        line.append(askButton(table.name, column.name));
        columns.append(line);
      }
      item.append(columns);
    }
    if (table.hiddenColumns > 0) {
      item.append(h("p", { className: "fine", text: `Скрыто столбцов: ${table.hiddenColumns}. Они не подставлены.` }));
    }
    if (table.constraints.length) {
      item.append(h("p", { className: "fine", text: "Ограничения, как они записаны в DDL:" }));
      const constraints = h("ul");
      for (const text of table.constraints) constraints.append(h("li", { text }));
      item.append(constraints);
    }
    list.append(item);
  }
  box.append(list);
  return box;
}

export function renderHistory(entries) {
  const list = document.getElementById("history");
  const empty = document.getElementById("history-empty");
  if (!list || !empty) return;
  list.replaceChildren();
  empty.hidden = entries.length > 0;
  entries.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example";
    button.dataset.action = "restore-history";
    button.dataset.index = String(index);
    button.disabled = entry.status !== "saved";
    const sentAs = entry.mode === "generate" ? "без выполнения" : "с выполнением";
    const kept = entry.status === "saved" ? "ответ сохранён" : "ждёт ответ";
    button.textContent = `${entry.domain} · ${sentAs} · ${kept} · ${entry.question}`;
    list.append(button);
  });
}

export function renderSchema(view) {
  const panel = document.getElementById("schema-panel");
  const caption = document.getElementById("schema-caption");
  const error = document.getElementById("schema-error");
  const code = document.getElementById("schema-sql");
  const outline = document.getElementById("schema-outline");
  const filterField = document.getElementById("schema-filter-field");
  caption.textContent = "";
  error.textContent = "";
  code.textContent = "";
  outline.replaceChildren();
  if (filterField) filterField.hidden = true;
  if (!view || view.status === "idle") {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  if (view.status === "loading") {
    caption.textContent = `Схема «${view.domain}» загружается. Доля выполнения неизвестна.`;
    return;
  }
  if (view.status === "error") {
    error.textContent = view.error || "Не удалось загрузить схему.";
    return;
  }
  const source = sourceLabel(view.source);
  caption.textContent = `DDL базы «${view.domain}» (${source}, ${view.dialect || "sqlite"}), как его прочитал сервер. Список ниже разобран из этого текста. Это не диаграмма связей.`;
  if (!view.text.trim()) {
    error.textContent = "Сервер вернул пустой текст схемы. Таблицы не подставлены.";
    return;
  }
  if (filterField) filterField.hidden = false;
  outline.append(renderOutline(view.text, view.filter || ""));
  code.textContent = view.text;
}

export function renderHealth(health) {
  const node = document.getElementById("health-status");
  if (!health || health.api !== "ok") {
    node.textContent = "API недоступен. Это не статус SQL.";
    return;
  }
  if (health.modelLoaded) {
    node.textContent = "API доступен. Модель загружена. Это не значит, что генерация удалась или что модель та, которую вы ожидаете.";
    return;
  }
  node.textContent = "API доступен. Модель не загружена. Это не предсказывает ответ на вопрос.";
}

export function setBusy(busy) {
  document.getElementById("btn-query").disabled = busy;
  document.getElementById("btn-generate").disabled = busy;
  document.getElementById("btn-cancel").hidden = !busy;
  document.getElementById("cancel-hint").hidden = !busy;
}

export function renderNotice(text) {
  document.getElementById("form-notice").textContent = text || "";
}

export function errorViewFromApi(err, format = formatDetail) {
  const lines = format(err?.detail);
  return {
    kind: err?.kind || "network",
    status: err?.status ?? null,
    lines,
  };
}
