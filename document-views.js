"use strict";
// Hash routes work on static hosting without server rewrite rules.
window.createDocumentViews = function (options) {
  const get = id => document.getElementById(id);
  let current = location.hash || "#list";
  let restoring = false;
  function show(view, id) {
    const hash = view === "list" || view === "new" ? `#${view}` : `#${view}${id == null ? "" : `/${encodeURIComponent(id)}`}`;
    if (!restoring && location.hash !== hash) history.pushState(null, "", hash);
    current = hash;
    document.querySelector(options.library).hidden = view !== "list";
    get(options.form).hidden = view === "list" || view === "preview";
    get("preview").hidden = view !== "preview";
    get("preview-button").hidden = view === "list" || view === "preview";
    get("back-to-list").hidden = view === "list";
    for (const selector of options.editorOnly || []) document.querySelector(selector).hidden = view === "list" || view === "preview";
    document.querySelector(".heading h1").textContent = view === "list" ? options.plural : view === "preview" ? `${options.label} preview` : `${view === "new" ? "Create" : "Edit"} ${options.label.toLowerCase()}`;
    document.querySelector(".heading p").textContent = view === "list" ? "View and manage your saved documents." : view === "preview" ? "Review your document, edit it, or print / save as PDF." : "Complete the details, then save or preview your document.";
    document.body.classList.toggle("print-ready", view === "preview");
  }
  async function restore() {
    const requested = location.hash || "#list";
    if ((options.dirty() && !confirm("Discard unsaved changes and leave this document?"))) {
      history.replaceState(null, "", current);
      return;
    }
    restoring = true;
    try {
      const [view, encodedId] = requested.slice(1).split("/");
      if (view === "list") { options.discard(); show("list"); }
      else if (view === "new") options.reset();
      else if ((view === "edit" || view === "preview") && encodedId) {
        await options.open(decodeURIComponent(encodedId));
        if (view === "preview") options.preview();
      } else show("list");
    } finally {
      restoring = false;
      history.replaceState(null, "", current);
    }
  }
  get("back-to-list").addEventListener("click", () => {
    if (options.busy() || (options.dirty() && !confirm("Discard unsaved changes and return to the list?"))) return;
    options.discard();
    show("list");
    options.refresh();
  });
  window.addEventListener("hashchange", () => {
    if (options.busy()) history.replaceState(null, "", current);
    else options.run(restore);
  });
  return { show, restore };
};
