"use strict";
window.createDocumentLogo = function ({ changed, run }) {
  const get = id => document.getElementById(id);
  let savedId = null, pendingId, url = null, generation = 0, loading = Promise.resolve(), failed = false;
  const images = [get("document-logo-preview"), get("document-logo-print")];
  function clearImages() {
    if (url) URL.revokeObjectURL(url);
    url = null;
    images.forEach(image => { image.hidden = true; image.removeAttribute("src"); });
  }
  function id() { return pendingId === undefined ? savedId : pendingId; }
  async function fetchLogo(fileId, source) {
    const token = ++generation;
    clearImages(); failed = false;
    get("document-logo-status").textContent = "";
    if (!fileId) return;
    try {
      const base = new URL((window.TIMESHEET_AUTH_CONFIG.backendBaseUrl || location.origin).replace(/\/$/, "") + "/");
      const target = new URL(source || `/api/company-logos/${encodeURIComponent(fileId)}`, base);
      if (target.origin !== base.origin) throw new Error("Unexpected company logo URL.");
      const blob = await window.timesheetApi(target.href.slice(base.origin.length), { responseType: "blob" });
      if (token !== generation) return;
      url = URL.createObjectURL(blob);
      images.forEach(image => { image.src = url; image.hidden = false; });
    } catch (error) {
      if (token !== generation) return;
      failed = true;
      get("document-logo-status").textContent = `${error.message} Upload a replacement or remove the logo.`;
    }
  }
  function apply(record = {}) {
    savedId = record.company_logo_file_id ?? record.companyLogoFileId ?? null;
    pendingId = undefined;
    get("document-logo-file").value = "";
    loading = fetchLogo(savedId, record.company_logo_url ?? record.companyLogoUrl);
    return loading;
  }
  get("document-logo-file").addEventListener("change", () => run(async () => {
    const input = get("document-logo-file"), file = input.files[0];
    if (!file) return;
    get("document-logo-status").textContent = "";
    try {
      if (file.size > 2 * 1024 * 1024) {
        const message = "Image exceeds the 2 MB limit. Please choose an image smaller than 2 MB.";
        get("document-logo-status").textContent = message;
        throw new Error(message);
      }
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP image.");
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width <= 4096 && bitmap.height <= 4096 && bitmap.width * bitmap.height <= 4000000;
      bitmap.close();
      if (!valid) throw new Error("Logo dimensions exceed the allowed limits.");
      // The server verifies single-frame content and normalizes the image.
      const body = new FormData(); body.append("file", file);
      const token = generation;
      const result = await window.timesheetApi("/api/company-logos", { method: "POST", body });
      if (token !== generation) return;
      if (!result?.fileId) throw new Error("Logo upload did not return a file ID.");
      pendingId = result.fileId;
      changed();
      loading = fetchLogo(result.fileId, result.url);
      await loading;
    } finally { input.value = ""; }
  }));
  get("document-logo-remove").addEventListener("click", () => {
    generation++; clearImages(); pendingId = null; failed = false;
    get("document-logo-status").textContent = "Logo removal pending. Save to apply.";
    changed();
  });
  function dispose() { generation++; clearImages(); }
  window.addEventListener("pagehide", dispose);
  window.addEventListener("timesheet-session-expired", () => { dispose(); window.workspaceSession?.expire(); });
  return {
    apply, reset: () => apply(),
    fields: () => pendingId === undefined ? {} : { companyLogoFileId: pendingId },
    ready: async () => {
      await loading;
      if (failed && id()) throw new Error("The company logo is unavailable. Re-upload or remove it before printing.");
      for (const image of images) if (!image.hidden) await image.decode();
    }
  };
};

window.downloadDocumentDraft = function (payload) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "document-draft.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
