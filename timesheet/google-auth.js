"use strict";
(() => {
  const config = window.TIMESHEET_AUTH_CONFIG, status = document.getElementById("login-status");
  let signingIn = false, loaded = false;
  const api = window.timesheetApi;
  function openTimesheet(data) {
    const user = data?.user || data?.account || data;
    window.TIMESHEET_USER = user && typeof user === "object" ? user : {};
    document.getElementById("account-name").textContent = user?.email || user?.name || "Authenticated Timesheet user";
    document.getElementById("login-panel").hidden = true;
    document.getElementById("timesheet-app").hidden = false;
    if (!loaded) { loaded = true; const script = document.createElement("script"); script.src = "timesheet.js?v=monthly-4"; script.onerror = () => { document.getElementById("status").textContent = "Unable to load Timesheet. Reload the page."; }; document.head.append(script); }
    else window.dispatchEvent(new Event("timesheet-login"));
  }
  window.addEventListener("timesheet-session-expired", () => {
    window.TIMESHEET_USER = null;
    document.getElementById("timesheet-app").hidden = true;
    document.getElementById("login-panel").hidden = false;
    status.textContent = "Session expired. Please login with Google again.";
  });
  async function receiveCredential(response) {
    if (signingIn) return;
    signingIn = true; status.textContent = "Logging in...";
    try {
      if (!response.credential) throw new Error("Google did not return an ID token.");
      const data = await api("/api/timesheet/google-login", {method:"POST", body:JSON.stringify({idToken:response.credential})});
      openTimesheet(data); status.textContent = "";
    } catch (error) { status.textContent = error.message; }
    finally { signingIn = false; }
  }
  async function start() {
    const signout = document.getElementById("signout-button");
    // Do not simulate logout when the backend endpoint is unknown.
    signout.hidden = !config.logoutPath;
    signout.addEventListener("click", async () => {
      const request = new Event("timesheet-before-logout", {cancelable:true});
      if (!window.dispatchEvent(request)) return;
      signout.disabled = true;
      try {
        await api(config.logoutPath,{method:"POST"});
        window.google?.accounts.id.disableAutoSelect();
        window.dispatchEvent(new Event("timesheet-session-expired"));
        document.getElementById("account-name").textContent = "";
        document.getElementById("status").textContent = "";
        status.textContent = "You have logged out.";
      }
      catch (error) { document.getElementById("status").textContent = error.message; }
      finally { signout.disabled = false; }
    });
    if (typeof config.backendBaseUrl !== "string") { status.textContent = "Configure the backend URL in auth-config.js."; return; }
    if (!config.clientId) { status.textContent = "Configure the Google Client ID in auth-config.js."; return; }
    status.textContent = "";
    try {
      if (config.sessionPath) openTimesheet(await api(config.sessionPath));
      else { await api("/api/timesheets?page=1&pageSize=1"); openTimesheet(null); }
    } catch (error) { if (error.status !== 401) status.textContent = error.message; }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => {
      google.accounts.id.initialize({client_id:config.clientId,callback:receiveCredential,ux_mode:"popup",auto_select:false});
      google.accounts.id.renderButton(document.getElementById("google-button"),{theme:"outline",size:"large",text:"signin_with",locale:"id",width:260});
    };
    script.onerror = () => { status.textContent = "Unable to load Google Login. Check your connection and reload."; };
    document.head.append(script);

  }
  start();
})();
