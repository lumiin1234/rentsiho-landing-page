"use strict";

// Keep HTTP details here; form and rendering code live in salary.js.
window.salaryApi = (() => {
  const baseUrl = window.TIMESHEET_AUTH_CONFIG.backendBaseUrl.replace(/\/$/, "");

  async function request(path, method = "GET", body) {
    let response;
    try {
      response = await fetch(`${baseUrl}/api/salaries${path}`, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      throw new Error("Cannot connect to the salary API. Check the backend URL and CORS configuration.");
    }

    if (response.status === 401) window.workspaceSession?.expire();
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (error) {
      throw new Error(`The API returned an unexpected response (${response.status}).`);
    }
    if (!response.ok) {
      const validationErrors = data?.errors && typeof data.errors === "object"
        ? Object.entries(data.errors).map(([field, messages]) =>
          `${field}: ${Array.isArray(messages) ? messages.join(" ") : messages}`
        ).join("\n")
        : "";
      const message = response.status === 401
        ? "Your session is unavailable or expired. Sign in to the backend, then refresh the salaries."
        : response.status === 409 || response.status === 412
        ? "This salary has changed. Reopen it before saving or deleting again."
        : validationErrors || data?.message || data?.detail || data?.title || `Request failed (${response.status}).`;
      throw new Error(message);
    }
    return data;
  }

  return {
    list: (page, pageSize = 20, period = "") => request(`?page=${page}&pageSize=${pageSize}${period ? `&period=${encodeURIComponent(period)}` : ""}`),
    get: (id) => request(`/${encodeURIComponent(id)}`),
    create: (salary) => request("", "POST", salary),
    update: (id, salary) => request(`/${encodeURIComponent(id)}`, "PUT", salary),
    remove: (id, version) => request(`/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`, "DELETE")
  };
})();
