const withJsonHeaders = (headers) => {
  const next = new Headers(headers || {});
  if (!next.has("Content-Type")) next.set("Content-Type", "application/json");
  return next;
};

export const requestJson = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: withJsonHeaders(options.headers),
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const looksLikeHtml = typeof body === "string" && /<(!doctype|html)\b/i.test(body);
    const message =
      (body && typeof body === "object" && (body.message || body.error)) ||
      (looksLikeHtml &&
        `Request failed (HTTP ${res.status}). Check API URL/proxy and that the backend is running.`) ||
      (typeof body === "string" && body.trim()) ||
      `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
};
