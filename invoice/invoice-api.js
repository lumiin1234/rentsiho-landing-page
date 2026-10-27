"use strict";

// Keep HTTP details here; form and rendering code live in invoice.js.
window.invoiceApi = (() => {
  const baseUrl = window.TIMESHEET_AUTH_CONFIG.backendBaseUrl.replace(/\/$/, "");

  async function request(path, method = "GET", body) {
    let response;
    try {
      response = await fetch(`${baseUrl}/api/invoices${path}`, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      throw new Error("Cannot connect to the invoice API. Check the backend URL and CORS configuration.");
    }

    if (response.status === 401) window.workspaceSession?.expire();
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (error) {
      if (!response.ok && text.trim()) data = text;
      else throw new Error(`The API returned an unexpected response (${response.status}).`);
    }
    if (!response.ok) {
      const validationErrors = data?.errors && typeof data.errors === "object"
        ? Object.entries(data.errors).map(([field, messages]) =>
          `${field}: ${Array.isArray(messages) ? messages.join(" ") : messages}`
        ).join("\n")
        : "";
      const backendMessage = [data?.message || data?.detail || data?.title, validationErrors].filter(Boolean).join("\n");
      const message = (typeof data === "string" ? data : data?.message || data?.detail || data?.title) || validationErrors || `Request failed (${response.status}).`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  return {
    list: (page, pageSize = 20) => request(`?page=${page}&pageSize=${pageSize}`),
    get: (id) => request(`/${encodeURIComponent(id)}`),
    create: (invoice) => request("", "POST", invoice),
    update: (id, invoice) => request(`/${encodeURIComponent(id)}`, "PUT", invoice),
    remove: (id, version) => request(`/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`, "DELETE")
  };
})();
