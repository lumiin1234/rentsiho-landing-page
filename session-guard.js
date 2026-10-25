"use strict";
window.workspaceSession = (() => {
  let redirecting = false;
  function expire() {
    if (redirecting) return;
    redirecting = true;
    document.querySelector("main").hidden = true;
    const next = location.pathname + location.search + location.hash;
    location.replace("../?login=1&role=timesheet&next=" + encodeURIComponent(next));
  }
  async function check() {
    const config = window.TIMESHEET_AUTH_CONFIG;
    const response = await fetch(config.backendBaseUrl.replace(/\/$/, "") + (config.sessionPath || "/api/me"), {
      credentials: "include", headers: { Accept: "application/json" }, cache: "no-store"
    });
    if (response.status === 401) { expire(); return false; }
    if (response.status === 403) throw new Error("Your account does not have access to this workspace. Contact your administrator.");
    if (!response.ok) throw new Error("Unable to verify your session. Reload the page to try again.");
    const session = await response.json();
    if (session?.isLoggedIn !== true) { expire(); return false; }
    return true;
  }
  const ready = check().then(valid => {
    if (valid) {
      document.documentElement.classList.remove("session-checking");
      setInterval(() => { if (!document.hidden) check().catch(() => {}); }, 60000);
      window.addEventListener("focus", () => check().catch(() => {}));
    }
    return valid;
  }).catch(error => {
    document.documentElement.classList.remove("session-checking");
    const main = document.querySelector("main");
    main.replaceChildren();
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = error.message || "Unable to verify your session. Check your connection and reload the page.";
    main.append(message);
    return false;
  });
  return { ready, expire };
})();
