"use strict";
window.timesheetApi = async function(path, options = {}) {
  const config = window.TIMESHEET_AUTH_CONFIG;
  if (typeof config.backendBaseUrl !== "string") throw new Error("Set backendBaseUrl in auth-config.js to your backend URL (or an empty string for same-origin).");
  const response = await fetch(config.backendBaseUrl.replace(/\/$/, "") + path, {
    ...options, credentials: "include", headers: {Accept:"application/json", ...(options.body ? {"Content-Type":"application/json"} : {}), ...options.headers}
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (_) { throw new Error("Backend returned an unexpected response."); }
  if (!response.ok) {
    const error = new Error(data?.message || data?.detail || data?.title || `Request failed (${response.status}).`);
    error.status = response.status;
    if (response.status === 401) window.dispatchEvent(new Event("timesheet-session-expired"));
    throw error;
  }
  return data;
};
