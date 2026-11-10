import { outlineSchema } from "./schema_outline.js";
import { tokenizeSql } from "./sql_text.js";
import { safetyState, countNoun } from "./state.js";
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

function sqlBlock(gen) {
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
  row.append(h("span", { className: "copy-status", attrs: { id: "copy-status", role: "status" } }));
  box.append(row);
  if (typeof gen.latency === "number" && Number.isFinite(gen.latency)) {
    box.append(h("p", { className: "fine", text: `Время генерации на сервере: ${gen.latency.toFixed(2)} с. Это не оценка качества.` }));
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
  if (gen && typeof gen.error === "string" && gen.error) {
    block.append(h("p", { className: "meter-detail", text: gen.error }));
  }
  return block;
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
    return `Показаны первые ${count} ${noun}; результат ограничен сервером.`;
  }
  if (query.truncated === false) {
    return `Получено ${count} ${noun}. Это размер показанного ответа, а не число записей в базе.`;
  }
  return `Загружено ${count} ${noun}. Сервер не сообщил, полный ли это результат.`;
}

function exportNote(query) {
  if (query.truncated === true) {
    return "Экспорт содержит только показанную часть. Результат на сервере ограничен.";
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

export function renderOutcome(state) {
  const root = document.getElementById("outcome");
  root.replaceChildren();
  if (state.inflight) {
    root.dataset.phase = "generating";
    root.setAttribute("aria-busy", "true");
    root.append(renderGenerating(state.inflight));
    return;
  }
  root.setAttribute("aria-busy", "false");
  if (!state.view) {
    root.dataset.phase = state.phase || "ready";
    root.append(h("p", { className: "idle", text: "Здесь появится SQL, статус ограничений и результат. Пока запрос не отправлен." }));
    return;
  }
  const view = state.view;
  root.dataset.phase = view.phase;
  if (view.phase === "request_error") {
    root.append(renderRequestError(view));
    return;
  }
  root.append(contextBlock(view));
  root.append(sqlBlock(view.gen));
  root.append(explanationBlock(view.gen));
  const assumptions = assumptionsBlock(view.gen);
  if (assumptions) root.append(assumptions);
  root.append(meters(view.gen));
  if (view.phase === "blocked_sql") {
    root.append(h("h3", { text: "SQL заблокирован" }));
    root.append(h("p", { text: "Запрос не выполнялся. Показанный SQL сервер не запускал." }));
    return;
  }
  if (view.phase === "schema_mismatch") {
    root.append(h("h3", { text: "SQL не соответствует схеме" }));
    root.append(h("p", { text: "Запрос не выполнялся. Это другой статус, чем блокировка SQL и чем таймаут выполнения." }));
    return;
  }
  if (view.phase === "execution_error") {
    if (view.errorCode === "query_timeout") {
      root.append(h("h3", { text: "Выполнение прервано по времени" }));
      root.append(h("p", { text: "Сервер остановил уже допущенный запрос по собственному таймауту. Это не блокировка SQL и не ошибка сети." }));
    } else {
      root.append(h("h3", { text: "Ошибка выполнения" }));
      root.append(h("p", { text: view.errorCode || "Сервер не вернул строки." }));
    }
    return;
  }
  if (view.mode === "generate" || !view.query) {
    root.append(h("h3", { text: "SQL без выполнения" }));
    root.append(h("p", { text: "Запрос не выполнялся: режим «Только SQL». Кнопки, которая запускает уже показанный текст, нет: выполнение на сервере заново генерирует SQL из вопроса." }));
    return;
  }
  root.append(renderTable(view));
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

function renderOutline(sql) {
  const outline = outlineSchema(sql);
  const box = h("div");
  if (outline.unparsed) {
    box.append(h("p", { text: "Таблицы из этого текста не разобраны. Ниже исходный DDL. Имена не подставлены." }));
    return box;
  }
  box.append(h("p", { className: "fine", text: "Список разобран из DDL сервера. Связи, которых нет в тексте, не добавляются." }));
  const list = h("ul", { className: "schema-tables" });
  for (const table of outline.tables) {
    const item = h("li");
    const head = h("div", { className: "schema-line" });
    head.append(h("span", { className: "k", text: table.name }));
    head.append(insertButton(table.name));
    item.append(head);
    if (table.columns.length) {
      const columns = h("ul");
      for (const column of table.columns) {
        const line = h("li", { className: "schema-line" });
        line.append(h("span", { text: column.name }));
        if (column.detail) line.append(h("span", { className: "fine", text: column.detail }));
        line.append(insertButton(column.name));
        columns.append(line);
      }
      item.append(columns);
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
    const sentAs = entry.mode === "generate" ? "без выполнения" : "с выполнением";
    button.textContent = `${entry.domain} · ${sentAs} · ${entry.question}`;
    list.append(button);
  });
}

export function renderSchema(view) {
  const panel = document.getElementById("schema-panel");
  const caption = document.getElementById("schema-caption");
  const error = document.getElementById("schema-error");
  const code = document.getElementById("schema-sql");
  const outline = document.getElementById("schema-outline");
  caption.textContent = "";
  error.textContent = "";
  code.textContent = "";
  outline.replaceChildren();
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
  outline.append(renderOutline(view.text));
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
