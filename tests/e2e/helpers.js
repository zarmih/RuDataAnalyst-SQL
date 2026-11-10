export const XSS = "<img src=x onerror=alert(1)><script>alert(1)</script>";

export const domainsOk = {
  domains: ["warehouse", "subscriptions", "local_sales"],
  built_in: ["warehouse", "subscriptions"],
  managed: ["local_sales"],
};

export function generateBody(overrides = {}) {
  return {
    sql: "SELECT name FROM products",
    explanation: "Берём названия из products.",
    assumptions: ["категория не задана"],
    confidence: "medium",
    is_safe: true,
    is_hallucinated: false,
    error: null,
    latency: 0.2,
    ...overrides,
  };
}

export function queryBody(overrides = {}, queryOverrides = {}) {
  const queryError = Object.prototype.hasOwnProperty.call(queryOverrides, "query_error")
    ? queryOverrides.query_error
    : null;
  const queryResult = Object.prototype.hasOwnProperty.call(queryOverrides, "query_result")
    ? queryOverrides.query_result
    : {
        columns: ["name", "note", "qty", "flag"],
        rows: [
          ["Альфа", null, 0, false],
          ["", "", 2, true],
        ],
        truncated: false,
      };
  return {
    generate_result: generateBody(overrides),
    query_result: queryError ? null : queryResult,
    query_error: queryError,
  };
}

export async function fulfillJson(route, status, data) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
}
