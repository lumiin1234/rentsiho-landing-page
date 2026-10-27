"use strict";
window.createTimesheetCompany = function (onChange) {
  const ids = ["from-company-name", "from-company-address", "from-company-email", "to-company-name", "to-company-address", "to-company-email"];
  const keys = ["fromCompanyName", "fromAddress", "fromEmail", "toCompanyName", "toAddress", "toEmail"];
  const get = id => document.getElementById(id);
  let state = { companyLogoFileId: null, companyLogoUrl: null, version: 0 }, original = "", objectUrl = null, generation = 0;
  let pending = Promise.resolve(), logoBlob = null;
  function release() { logoBlob = null; if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; get("company-logo-preview").hidden = true; get("company-logo-preview").removeAttribute("src"); }
  function payload() { return { ...Object.fromEntries(keys.map((key, i) => [key, get(ids[i]).value.trim()])), companyLogoFileId: state.companyLogoFileId, version: state.version }; }
  function validate(data, period) {
    if (data?.period !== period || !Number.isInteger(data.version) || data.version < 0) throw new Error("Invalid monthly company response.");
    return data;
  }
  async function logo() {
    const token = ++generation;
    release();
    get("company-logo-status").textContent = "";
    if (!state.companyLogoFileId) return;
    try {
      const base = new URL((window.TIMESHEET_AUTH_CONFIG.backendBaseUrl || location.origin).replace(/\/$/, "") + "/");
      const url = new URL(state.companyLogoUrl || `/api/company-logos/${encodeURIComponent(state.companyLogoFileId)}`, base);
      if (url.origin !== base.origin) throw new Error("Unexpected logo URL origin.");
      const blob = await window.timesheetApi(url.href.slice(base.origin.length), { responseType: "blob" });
      if (token !== generation || !window.TIMESHEET_USER) return;
      logoBlob = blob;
      objectUrl = URL.createObjectURL(blob);
      get("company-logo-preview").src = objectUrl;
      get("company-logo-preview").hidden = false;
    } catch (error) { if (token === generation) get("company-logo-status").textContent = `${error.message} You can upload a replacement logo.`; }
  }
  async function apply(data) {
    state = { ...data };
    ids.forEach((id, i) => { get(id).value = data[keys[i]] || ""; });
    original = JSON.stringify(payload());
    get("company-logo-file").value = "";
    pending = logo();
    await pending;
  }
  ids.forEach(id => get(id).addEventListener("input", onChange));
  get("company-logo-remove").addEventListener("click", () => {
    generation++; release(); state.companyLogoFileId = null; state.companyLogoUrl = null;
    get("company-logo-file").value = ""; get("company-logo-status").textContent = "Logo removal pending. Save month to apply."; onChange();
  });
  async function upload() {
    const file = get("company-logo-file").files[0];
    if (!file) return;
    get("company-logo-status").textContent = "";
    if (file.size > 2 * 1024 * 1024) {
      const message = "Image exceeds the 2 MB limit. Please choose an image smaller than 2 MB.";
      get("company-logo-status").textContent = message;
      get("company-logo-file").value = "";
      throw new Error(message);
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP image.");
    // The backend also validates frame count and normalizes the uploaded image.
    const bitmap = await createImageBitmap(file);
    const valid = bitmap.width <= 4096 && bitmap.height <= 4096 && bitmap.width * bitmap.height <= 4000000;
    bitmap.close();
    if (!valid) throw new Error("Logo dimensions exceed the allowed limits.");
    const body = new FormData(); body.append("file", file);
    const token = generation;
    const result = await window.timesheetApi("/api/company-logos", { method: "POST", body });
    if (token !== generation || !window.TIMESHEET_USER) return;
    if (!result?.fileId) throw new Error("Upload response is missing the logo file ID.");
    state.companyLogoFileId = result.fileId; state.companyLogoUrl = result.url;
    onChange(); pending = logo(); await pending;
    get("company-logo-file").value = "";
  }
  window.addEventListener("pagehide", () => { generation++; release(); });
  return { payload, validate, apply, upload, ready: () => pending,
    exportLogo: async () => { await pending; if (state.companyLogoFileId && !logoBlob) throw new Error("Company logo could not be loaded. Re-upload it or remove it before exporting."); return logoBlob; },
    dirty: () => JSON.stringify(payload()) !== original,
    valid: () => ids.every(id => get(id).reportValidity()),
    values: () => ids.map(id => get(id).value.trim()),
    clear: () => { generation++; release(); state = { companyLogoFileId: null, version: 0 }; ids.forEach(id => { get(id).value = ""; }); original = ""; }
  };
};
