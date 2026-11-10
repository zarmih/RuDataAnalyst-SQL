export function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function safetyState(gen) {
  if (!gen || typeof gen.is_safe !== "boolean") return "unknown";
  if (gen.is_safe === false) return "blocked";
  if (gen.is_hallucinated === true) return "schema_mismatch";
  if (gen.is_hallucinated !== false) return "structural_only";
  return "passed";
}

function hasGenerateFields(gen) {
  return typeof gen.sql === "string" || typeof gen.is_safe === "boolean" || typeof gen.explanation === "string";
}

function extractGenerate(mode, data) {
  if (!isPlainObject(data)) return null;
  if (mode === "query") {
    if (!isPlainObject(data.generate_result) || !hasGenerateFields(data.generate_result)) return null;
    return data.generate_result;
  }
  if (!hasGenerateFields(data)) return null;
  return data;
}

export function classifyResponse(mode, data) {
  const gen = extractGenerate(mode, data);
  if (!gen) {
    return { phase: "request_error", gen: null, query: null, errorKind: "invalid_shape", errorCode: null };
  }
  const safety = safetyState(gen);
  const queryError = mode === "query" && isPlainObject(data) ? data.query_error : null;
  if (safety === "blocked" || queryError === "unsafe_sql") {
    return { phase: "blocked_sql", gen, query: null, errorKind: null, errorCode: "unsafe_sql" };
  }
  if (safety === "schema_mismatch" || queryError === "schema_hallucination") {
    return { phase: "schema_mismatch", gen, query: null, errorKind: null, errorCode: "schema_hallucination" };
  }
  if (mode === "generate") {
    return { phase: "result", gen, query: null, errorKind: null, errorCode: null };
  }
  if (queryError === "query_timeout") {
    return { phase: "execution_error", gen, query: null, errorKind: null, errorCode: "query_timeout" };
  }
  if (queryError) {
    return { phase: "execution_error", gen, query: null, errorKind: null, errorCode: String(queryError) };
  }
  const query = isPlainObject(data) ? data.query_result : null;
  if (!isPlainObject(query) || !Array.isArray(query.columns) || !Array.isArray(query.rows)) {
    return { phase: "request_error", gen, query: null, errorKind: "invalid_shape", errorCode: null };
  }
  return { phase: "result", gen, query, errorKind: null, errorCode: null };
}

export function reconcileDomain(previous, builtIn, managed, { allowInitial = false } = {}) {
  const all = [...builtIn, ...managed];
  if (previous && all.includes(previous)) return { domain: previous, vanished: false };
  if (previous && !all.includes(previous)) return { domain: "", vanished: true };
  if (allowInitial && all.length > 0) return { domain: all[0], vanished: false };
  return { domain: "", vanished: false };
}

export function domainSource(id, builtIn, managed) {
  if (builtIn.includes(id)) return "built_in";
  if (managed.includes(id)) return "managed";
  return "unknown";
}

export function countNoun(n, one, few, many) {
  const abs = Math.abs(Number(n)) || 0;
  const n10 = abs % 10;
  const n100 = abs % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}
