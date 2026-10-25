"use strict";
window.rentsihoGoogleLogin = {
  async signIn(idToken, role) {
    const config = window.TIMESHEET_AUTH_CONFIG;
    const response = await fetch(config.backendBaseUrl.replace(/\/$/, "") + "/api/google-login", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ idToken, role })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.detail || data.title || `Google login failed (${response.status}).`);
    return data;
  },
  role(data, requestedRole) {
    return String(data?.user?.role || data?.role || data?.data?.user?.role || data?.data?.role || requestedRole).toLowerCase().trim();
  },
  destination(requestedRole, data) {
    if (requestedRole === "timesheet") {
      if (data?.timesheetAccess !== true && data?.data?.timesheetAccess !== true) {
        throw new Error("Your account does not have Timesheet access. Contact your administrator.");
      }
      return "/timesheet/";
    }
    return window.TIMESHEET_AUTH_CONFIG.flutterDashboardUrl;
  }
};
