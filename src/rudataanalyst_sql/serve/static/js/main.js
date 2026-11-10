import { EXAMPLES } from "./examples.js";
import {
  ApiError,
  fetchDomains,
  fetchHealth,
  fetchSchema,
  postSql,
} from "./api.js";
import { classifyResponse, domainSource, reconcileDomain } from "./state.js";
import { toCsv } from "./csv.js";
import {
  errorViewFromApi,
  renderDomainOptions,
  renderDomainStatus,
  renderHealth,
  renderHistory,
  renderNotice,
  renderOutcome,
  renderSchema,
  setBusy,
} from "./render.js";

const state = {
  phase: "loading_domains",
  domains: { built_in: [], managed: [] },
  domainsLoaded: false,
  domainsFailed: false,
  form: { domain: "", question: "" },
  schemaView: { status: "idle", domain: "", text: "", error: "" },
  health: { api: "unknown", modelLoaded: false },
  inflight: null,
  view: null,
  heldView: null,
  history: [],
  notice: "",
};

let requestSeq = 0;
let schemaSeq = 0;
let elapsedTimer = 0;

const domainSelect = document.getElementById("domain");
const questionInput = document.getElementById("question");
const live = document.getElementById("live-region");

function announce(text) {
  live.textContent = "";
  live.textContent = text;
}

function knownDomains() {
  return [...state.domains.built_in, ...state.domains.managed];
}

function rememberForm() {
  state.form.domain = domainSelect.value;
  state.form.question = questionInput.value;
}

function showNotice(text) {
  state.notice = text;
  renderNotice(text);
}

function clearSchema() {
  schemaSeq += 1;
  state.schemaView = { status: "idle", domain: "", text: "", error: "" };
  renderSchema(state.schemaView);
}

function startElapsed() {
  stopElapsed();
  elapsedTimer = window.setInterval(() => {
    const node = document.getElementById("elapsed");
    if (!node || !state.inflight) return;
    const seconds = Math.floor((Date.now() - state.inflight.startedAt) / 1000);
    node.textContent = `Прошло ${seconds} с.`;
  }, 250);
}

function stopElapsed() {
  if (elapsedTimer) window.clearInterval(elapsedTimer);
  elapsedTimer = 0;
}

async function refreshHealth() {
  try {
    const data = await fetchHealth();
    state.health = { api: data.status === "ok" ? "ok" : "down", modelLoaded: data.model_loaded === true };
  } catch {
    state.health = { api: "down", modelLoaded: false };
  }
  renderHealth(state.health);
}

async function loadDomains() {
  const previous = domainSelect.value || state.form.domain;
  try {
    const data = await fetchDomains();
    const builtIn = Array.isArray(data.built_in) ? data.built_in.filter((item) => typeof item === "string") : [];
    const managed = Array.isArray(data.managed) ? data.managed.filter((item) => typeof item === "string") : [];
    state.domains = { built_in: builtIn, managed };
    state.domainsFailed = false;
    const choice = reconcileDomain(previous, builtIn, managed, { allowInitial: !state.domainsLoaded && !previous });
    state.domainsLoaded = true;
    renderDomainOptions(domainSelect, builtIn, managed, choice.domain);
    state.form.domain = domainSelect.value;
    renderDomainStatus(state.domains, false);
    if (choice.vanished) {
      showNotice(`База «${previous}» исчезла из списка. Вопрос сохранён.`);
      clearSchema();
    }
    if (!builtIn.length && !managed.length) announce("Нет доступных баз");
    else if (!state.notice) announce("Список баз загружен");
  } catch {
    state.domainsFailed = true;
    if (!state.domainsLoaded) {
      state.domains = { built_in: [], managed: [] };
      renderDomainOptions(domainSelect, [], [], "");
    }
    renderDomainStatus(state.domains, true);
    announce("Не удалось загрузить список баз");
  }
}

function applyExample(example) {
  rememberForm();
  if (!knownDomains().includes(example.domain)) {
    showNotice(`Пример относится к базе «${example.domain}». Её нет в списке, выбор не изменён.`);
    return;
  }
  if (state.form.domain !== example.domain) clearSchema();
  state.form.domain = example.domain;
  state.form.question = example.question;
  domainSelect.value = example.domain;
  questionInput.value = example.question;
  showNotice("");
  questionInput.focus();
}

function viewFromClassification(classified, ticket) {
  const view = {
    ...classified,
    domain: ticket.domain,
    domainSource: domainSource(ticket.domain, state.domains.built_in, state.domains.managed),
    question: ticket.question,
    mode: ticket.mode,
    sort: { column: null, dir: "asc" },
    expanded: new Set(),
  };
  if (classified.phase === "request_error") {
    view.error = { kind: classified.errorKind || "invalid_shape", status: null, lines: [] };
  }
  return view;
}

function detailIsDomainMissing(error) {
  const lines = error?.lines || [];
  return lines.includes("domain_not_found");
}

async function submit(mode) {
  if (state.inflight) return;
  rememberForm();
  const domain = state.form.domain;
  const question = state.form.question.trim();
  if (!domain) {
    showNotice("Выберите базу. Вопрос сохранён.");
    return;
  }
  if (!question) {
    showNotice("Введите вопрос. Текст в поле сохранён.");
    return;
  }
  const ticket = {
    id: ++requestSeq,
    mode,
    domain,
    question,
    startedAt: Date.now(),
    controller: new AbortController(),
  };
  state.inflight = ticket;
  state.heldView = state.view;
  rememberSubmission(ticket);
  showNotice("");
  setBusy(true);
  renderOutcome(state);
  announce(`Идёт генерация, запрос ${ticket.id}. Доля выполнения неизвестна.`);
  startElapsed();
  refreshHealth();
  try {
    const data = await postSql(mode, { domain, question }, { signal: ticket.controller.signal });
    if (!state.inflight || state.inflight.id !== ticket.id) return;
    const classified = classifyResponse(mode, data);
    state.view = viewFromClassification(classified, ticket);
    state.phase = classified.phase;
    announce(announcementFor(state.view));
  } catch (err) {
    if (!state.inflight || state.inflight.id !== ticket.id) return;
    if (err instanceof ApiError && err.kind === "aborted") {
      state.view = state.heldView;
      state.phase = state.view?.phase || "ready";
      showNotice("Ожидание прекращено. Вычисления на сервере могли продолжиться.");
      announce("Ожидание прекращено. Вычисления на сервере могли продолжиться.");
    } else {
      const error = err instanceof ApiError ? errorViewFromApi(err) : { kind: "network", status: null, lines: [] };
      state.view = {
        phase: "request_error",
        gen: null,
        query: null,
        domain,
        domainSource: domainSource(domain, state.domains.built_in, state.domains.managed),
        question,
        mode,
        error,
        sort: { column: null, dir: "asc" },
        expanded: new Set(),
      };
      state.phase = "request_error";
      announce(announcementFor(state.view));
      if (detailIsDomainMissing(error)) {
        showNotice("Выбранная база недоступна. Список обновляется, вопрос сохранён.");
        await loadDomains();
      }
    }
  } finally {
    if (state.inflight && state.inflight.id === ticket.id) state.inflight = null;
    stopElapsed();
    setBusy(false);
    renderOutcome(state);
  }
}

function announcementFor(view) {
  if (!view) return "Готово";
  if (view.phase === "blocked_sql") return "SQL заблокирован";
  if (view.phase === "schema_mismatch") return "SQL не соответствует схеме";
  if (view.phase === "execution_error" && view.errorCode === "query_timeout") return "Выполнение прервано по времени";
  if (view.phase === "execution_error") return "Ошибка выполнения";
  if (view.phase === "request_error") {
    if (view.error?.kind === "network") return "Не удалось отправить запрос";
    if (view.error?.kind === "timeout") return "Время ожидания истекло";
    if (view.error?.kind === "invalid_json" || view.error?.kind === "invalid_shape") return "Модель не ответила";
    return "Запрос отклонён сервером";
  }
  if (view.mode === "generate") return "SQL готов, запрос не выполнялся";
  if (view.query?.truncated === true) return `Показана только часть строк: ${view.query.rows.length}`;
  if (view.query && view.query.rows.length === 0) return "Запрос выполнен, строк нет";
  return "Ответ готов";
}

function rememberSubmission(ticket) {
  const entry = { domain: ticket.domain, question: ticket.question, mode: ticket.mode };
  state.history = [
    entry,
    ...state.history.filter((item) => item.domain !== entry.domain || item.question !== entry.question || item.mode !== entry.mode),
  ].slice(0, 8);
  renderHistory(state.history);
}

function restoreHistory(index) {
  const entry = state.history[index];
  if (!entry) return;
  questionInput.value = entry.question;
  state.form.question = entry.question;
  if (!knownDomains().includes(entry.domain)) {
    showNotice(`В истории база «${entry.domain}». Её нет в списке, выбор не изменён. Вопрос возвращён в поле, запрос не отправлен.`);
    questionInput.focus();
    return;
  }
  if (state.form.domain !== entry.domain) clearSchema();
  state.form.domain = entry.domain;
  domainSelect.value = entry.domain;
  showNotice("Вопрос из истории возвращён в поле. Запрос не отправлен.");
  questionInput.focus();
}

function insertSchemaName(name) {
  if (!name) return;
  const current = questionInput.value;
  questionInput.value = current && !/\s$/.test(current) ? `${current} ${name}` : `${current}${name}`;
  rememberForm();
  questionInput.focus();
  showNotice("Имя из схемы вставлено в вопрос. Запрос не отправлен.");
}

function cancelWait() {
  if (!state.inflight) return;
  state.inflight.controller.abort();
}

async function copyText(text, statusId, success, failure) {
  const status = document.getElementById(statusId);
  let ok = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "clipboard-fallback";
    document.body.append(area);
    area.select();
    ok = document.execCommand("copy");
    area.remove();
  }
  if (status) status.textContent = ok ? success : failure;
}

function cellValue(key) {
  const [rowIndex, colIndex] = key.split(":").map(Number);
  const row = state.view?.query?.rows?.[rowIndex];
  if (!Array.isArray(row)) return "";
  const value = row[colIndex];
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function downloadCsv() {
  const view = state.view;
  if (!view?.query) return;
  const csv = toCsv(view.query.columns, view.query.rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeDomain = String(view.domain || "result").replace(/[^A-Za-z0-9_-]/g, "") || "result";
  link.href = url;
  link.download = `rudata-${safeDomain}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  announce(view.query.truncated === true ? "CSV содержит только показанную часть" : "CSV сохранён для загруженных строк");
}

async function loadSchema() {
  rememberForm();
  const domain = state.form.domain;
  if (!domain) {
    showNotice("Сначала выберите базу. Схема не запрашивалась.");
    return;
  }
  const ticket = ++schemaSeq;
  state.schemaView = { status: "loading", domain, text: "", error: "" };
  renderSchema(state.schemaView);
  try {
    const data = await fetchSchema(domain);
    if (ticket !== schemaSeq) return;
    if (!data || data.domain !== domain || typeof data.schema_sql !== "string") {
      state.schemaView = {
        status: "error",
        domain,
        text: "",
        error: "Ответ схемы неожиданной формы. Таблицы не подставлены.",
      };
    } else {
      state.schemaView = {
        status: "ready",
        domain,
        text: data.schema_sql,
        error: "",
        source: data.source,
        dialect: data.dialect,
      };
    }
  } catch (err) {
    if (ticket !== schemaSeq) return;
    const missing = err instanceof ApiError && err.kind === "http" && err.status === 400;
    state.schemaView = {
      status: "error",
      domain,
      text: "",
      error: missing
        ? "Схема недоступна: база не найдена или идентификатор отклонён."
        : "Не удалось загрузить схему.",
    };
  }
  renderSchema(state.schemaView);
}

function onOutcomeClick(event) {
  const button = event.target.closest("button");
  if (!button || !state.view) return;
  const action = button.dataset.action;
  if (action === "copy-sql" && typeof state.view.gen?.sql === "string") {
    copyText(state.view.gen.sql, "copy-status", "SQL скопирован", "Не удалось скопировать SQL");
    return;
  }
  if (action === "copy-cell") {
    copyText(cellValue(button.dataset.key), "copy-status", "Значение скопировано", "Не удалось скопировать значение");
    return;
  }
  if (action === "export-csv") {
    downloadCsv();
    return;
  }
  if (action === "toggle-cell") {
    const key = button.dataset.key;
    if (state.view.expanded.has(key)) state.view.expanded.delete(key);
    else state.view.expanded.add(key);
    renderOutcome(state);
    document.querySelector(`[data-action="toggle-cell"][data-key="${CSS.escape(key)}"]`)?.focus();
    return;
  }
  if (action === "sort") {
    const column = Number(button.dataset.col);
    const sort = state.view.sort || { column: null, dir: "asc" };
    if (sort.column !== column) state.view.sort = { column, dir: "asc" };
    else if (sort.dir === "asc") state.view.sort = { column, dir: "desc" };
    else state.view.sort = { column: null, dir: "asc" };
    renderOutcome(state);
    document.querySelector(`[data-action="sort"][data-col="${column}"]`)?.focus();
    return;
  }
  if (action === "retry") submit(state.view.mode);
}

function wireExamples() {
  const list = document.getElementById("examples");
  for (const example of EXAMPLES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example";
    button.dataset.domain = example.domain;
    button.textContent = `${example.label} · ${example.domain}`;
    button.addEventListener("click", () => applyExample(example));
    list.append(button);
  }
}

domainSelect.addEventListener("change", () => {
  rememberForm();
  clearSchema();
  showNotice("");
});
questionInput.addEventListener("input", rememberForm);
questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    submit("query");
  }
});
document.getElementById("btn-query").addEventListener("click", () => submit("query"));
document.getElementById("btn-generate").addEventListener("click", () => submit("generate"));
document.getElementById("btn-cancel").addEventListener("click", cancelWait);
document.getElementById("btn-schema").addEventListener("click", loadSchema);
document.getElementById("btn-retry-domains").addEventListener("click", loadDomains);
document.getElementById("outcome").addEventListener("click", onOutcomeClick);
document.getElementById("schema-panel").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "insert-name") return;
  insertSchemaName(button.dataset.name || "");
});
document.getElementById("history").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "restore-history") return;
  restoreHistory(Number(button.dataset.index));
});

wireExamples();
renderOutcome(state);
renderHealth(state.health);
loadDomains();
refreshHealth();
