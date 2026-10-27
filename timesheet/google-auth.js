"use strict";
(async () => {
  if (window.TIMESHEET_BOOTSTRAP_STARTED) return;
  window.TIMESHEET_BOOTSTRAP_STARTED = true;
  const api = window.timesheetApi;
  const config = window.TIMESHEET_AUTH_CONFIG;
  window.addEventListener("timesheet-session-expired", () => {
    window.TIMESHEET_USER = null;
    document.getElementById("timesheet-app").hidden = true;
    window.workspaceSession.expire();
  });
  if (!await window.workspaceSession.ready) return;
  let user;
  try {
    user = await api("/api/me", { cache: "no-store" });
    if (user?.isLoggedIn !== true) {
      window.workspaceSession.expire();
      return;
    }
  } catch (error) {
    if (error.status === 401) window.workspaceSession.expire();
    else document.getElementById("status").textContent = error.status === 403
      ? "Your account does not have Timesheet access. Contact your administrator."
      : `Unable to load your account: ${error.message}. Please reload to try again.`;
    return;
  }
  window.TIMESHEET_USER = user;
  if (location.search.includes("login=")) history.replaceState(null, "", location.pathname + location.hash);
  document.getElementById("timesheet-app").hidden = false;
  document.getElementById("account-name").textContent = user.name || user.email || `User ${user.userId}`;
  const script = document.createElement("script");
  script.id = "timesheet-app-script";
  script.src = "timesheet.js?v=excel-logo-1";
  script.onerror = () => { document.getElementById("status").textContent = "Unable to load Timesheet. Reload the page."; };
  document.head.append(script);
  const signout = document.getElementById("signout-button");
  signout.hidden = !config.logoutPath;
  signout.addEventListener("click", async () => {
    if (!window.dispatchEvent(new Event("timesheet-before-logout", { cancelable: true }))) return;
    signout.disabled = true;
    try {
      await api(config.logoutPath, { method: "POST" });
      window.workspaceSession.expire();
    } catch (error) { document.getElementById("status").textContent = error.message; }
    finally { signout.disabled = false; }
  });
})();
