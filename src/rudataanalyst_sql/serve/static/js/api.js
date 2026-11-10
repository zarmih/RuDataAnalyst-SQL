export class ApiError extends Error {
  constructor(kind, info = {}) {
    super(info.message || kind);
    this.name = "ApiError";
    this.kind = kind;
    this.status = info.status ?? null;
    this.detail = info.detail ?? null;
  }
}

export function requestTimeoutMs() {
  const configured = Number(globalThis.__RUDATA_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 50) return configured;
  return 120000;
}

export function formatDetail(detail) {
  if (detail == null) return [];
  if (typeof detail === "string") return [detail];
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const loc = Array.isArray(item.loc) ? item.loc.map(String).join(".") : "";
        const msg = typeof item.msg === "string"
          ? item.msg
          : typeof item.message === "string"
            ? item.message
            : JSON.stringify(item);
        return loc ? `${loc}: ${msg}` : msg;
      }
      return String(item);
    });
  }
  if (typeof detail === "object") return [JSON.stringify(detail)];
  return [String(detail)];
}

const DETAIL_TEXT = {
  domain_not_found: "База с таким идентификатором не найдена.",
  unsafe_sql: "Сервер не стал выполнять запрос: SQL не прошёл ограничения.",
  schema_hallucination: "Сервер не стал выполнять запрос: SQL не совпал со схемой.",
  query_timeout: "Сервер прервал выполнение по таймауту.",
};

export function explainDetailLine(line) {
  return DETAIL_TEXT[line] || line;
}

function combineSignals(timeoutSignal, userSignal) {
  const signals = [timeoutSignal];
  if (userSignal) signals.push(userSignal);
  return AbortSignal.any(signals);
}

async function readBody(response) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const raw = await response.text();
  if (!contentType.includes("application/json")) {
    return { json: false, data: null };
  }
  try {
    return { json: true, data: raw ? JSON.parse(raw) : null };
  } catch {
    return { json: false, data: null };
  }
}

async function requestJson(url, options, userSignal) {
  const timeoutMs = options.timeoutMs ?? requestTimeoutMs();
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = combineSignals(timeout, userSignal);
  let response;
  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers: { Accept: "application/json", ...(options.headers || {}) },
      body: options.body,
      signal,
    });
  } catch {
    if (timeout.aborted) throw new ApiError("timeout");
    if (userSignal?.aborted) throw new ApiError("aborted");
    throw new ApiError("network");
  }
  const body = await readBody(response);
  if (!body.json || body.data == null || typeof body.data !== "object") {
    throw new ApiError("invalid_json", { status: response.status });
  }
  if (!response.ok) {
    throw new ApiError("http", { status: response.status, detail: body.data.detail ?? null });
  }
  return body.data;
}

export function fetchDomains() {
  return requestJson("/v1/domains", { timeoutMs: 10000 });
}

export function fetchHealth() {
  return requestJson("/health", { timeoutMs: 4000 });
}

export function fetchSchema(domain) {
  return requestJson(`/v1/schema/${encodeURIComponent(domain)}`, { timeoutMs: 10000 });
}

export function postSql(mode, payload, { signal } = {}) {
  const path = mode === "generate" ? "/v1/sql/generate" : "/v1/sql/query";
  return requestJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, signal);
}
