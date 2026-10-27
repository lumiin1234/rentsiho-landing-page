"use strict";
(async function () {
  if (window.workspaceSession && !await window.workspaceSession.ready) return;
  var form = document.getElementById("invoice-form");
  var services = document.getElementById("services");
  var preview = document.getElementById("preview");
  var nextId = 0, dirty = false;
  let currentInvoice = null;
  let page = 1;
  const pageSize = 20;
  let busy = false;
  let saveBlocked = false;
  const api = window.invoiceApi;
  const logo = window.createDocumentLogo({ changed: invalidate, run: runAction });
  const fieldMap = {
    number: "invoiceNumber", date: "invoiceDate", paymentDays: "paymentDays",
    fromName: "fromName", fromAddress: "fromAddress", fromCity: "fromCity",
    toName: "toName", toAddress: "toAddress", toCity: "toCity",
    email: "email", phone: "phone", website: "website", accountName: "accountName",
    bankName: "bankName", iban: "iban", swift: "swift", branch: "branch", instructions: "instructions"
  };

  // The API may serialize database names as snake_case or camelCase.
  function read(record, key) {
    const camelCase = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const snakeCase = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    return record[key] ?? record[camelCase] ?? record[snakeCase];
  }

  function unwrap(response) {
    return response?.data ?? response;
  }

  function setMessage(id, message, isError = false) {
    const element = document.getElementById(id);
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function showFeedback(type, message) {
    const dialog = document.getElementById("feedback-dialog");
    dialog.dataset.type = type;
    document.getElementById("feedback-title").textContent = type === "success" ? "Invoice saved" : "Unable to complete the request";
    document.getElementById("feedback-message").textContent = message;
    document.getElementById("feedback-icon").textContent = type === "success" ? "?" : "!";
    if (!dialog.open) dialog.showModal();
  }
  document.getElementById("feedback-close").addEventListener("click", () => document.getElementById("feedback-dialog").close());

  function updateEditorState() {
    document.getElementById("editor-state").textContent = currentInvoice
      ? `Editing ${value("number")} · Version ${currentInvoice.version}${dirty ? " · Unsaved changes" : " · Saved"}`
      : "New invoice · Not saved yet";
    document.getElementById("save-invoice").textContent = currentInvoice ? "Save changes" : "Save invoice";
  }

  // Serialize all services on both POST and PUT; the backend replaces the full item set.
  function invoicePayload() {
    const invoice = { currency: "CHF", ...logo.fields() };
    Object.entries(fieldMap).forEach(([name, key]) => {
      invoice[key] = name === "paymentDays" ? Number(value(name)) : value(name).trim();
    });
    invoice.items = rows().map((entry, index) => ({
      lineNumber: index + 1,
      consultant: entry.consultant.trim(),
      activity: entry.activity.trim(),
      serviceMonth: `${entry.month}-01`,
      daysHundredths: Math.round(entry.days * 100),
      dailyRateCents: entry.rateCents
    }));
    if (currentInvoice) invoice.version = currentInvoice.version;
    return invoice;
  }

  let views;
  function showEditor() {
    views?.show(currentInvoice ? "edit" : "new", currentInvoice?.id);
    preview.hidden = true;
    form.hidden = false;
    document.getElementById("preview-button").hidden = false;
    document.body.classList.remove("print-ready");
  }

  function fillInvoice(invoice) {
    if (invoice?.id == null || !Number.isInteger(invoice.version) || !Array.isArray(invoice.items) || !invoice.items.length) {
      throw new Error("The API detail must include id, version and at least one item.");
    }
    clearValidationErrors();
    logo.apply(invoice);
    document.getElementById("document-conflict").hidden = true;
    Object.entries(fieldMap).forEach(([name, key]) => {
      const savedValue = read(invoice, key) ?? "";
      field(name).value = name === "date" ? String(savedValue).slice(0, 10) : savedValue;
      field(name).setCustomValidity("");
    });
    services.textContent = "";
    invoice.items.forEach((item) => {
      const row = addService();
      const values = {
        consultant: item.consultant, activity: item.activity,
        month: String(read(item, "service_month") ?? "").slice(0, 7),
        days: read(item, "days_hundredths") / 100,
        rate: read(item, "daily_rate_cents") / 100
      };
      Object.entries(values).forEach(([key, itemValue]) => {
        row.querySelector(`[data-field="${key}"]`).value = itemValue ?? "";
      });
    });
    currentInvoice = { id: invoice.id, version: invoice.version };
    saveBlocked = false;
    dirty = false;
    updateTotals();
    updateEditorState();
    showEditor();
  }

  async function runAction(action) {
    if (busy) return;
    busy = true;
    // Freeze inputs during requests so late responses cannot overwrite new edits.
    const controls = Array.from(document.querySelectorAll("main button, main input, main textarea"));
    const disabledStates = controls.map((control) => control.disabled);
    controls.forEach((control) => { control.disabled = true; });
    try {
      await action();
    } catch (error) {
      setMessage("save-status", "");
      showFeedback("error", error.message);
      if (error.status === 409 || error.status === 412) { saveBlocked = true; document.getElementById("document-conflict").hidden = false; }
    } finally {
      controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
      busy = false;
      updateTotals();
      updatePagination();
    }
  }

  let hasNextPage = false;
  function updatePagination() {
    document.getElementById("previous-page").disabled = busy || page <= 1;
    document.getElementById("next-page").disabled = busy || !hasNextPage;
    document.getElementById("page-label").textContent = `Page ${page}`;
  }

  async function loadInvoices(targetPage = page) {
    setMessage("list-status", "Loading invoices…");
    try {
      const result = unwrap(await api.list(targetPage, pageSize));
      const invoices = Array.isArray(result) ? result : result?.items ?? result?.invoices;
      if (!Array.isArray(invoices)) throw new Error("The API list must return an array or { items, totalCount }.");
      page = targetPage;
      const count = result.totalCount ?? result.total_count ?? result.total;
      hasNextPage = Number.isFinite(count)
        ? page * pageSize < count
        : invoices.length === pageSize;
      const body = document.getElementById("invoice-list");
      body.textContent = "";
      invoices.forEach((invoice) => {
        const row = body.insertRow();
        [read(invoice, "invoice_number"), read(invoice, "to_name"), read(invoice, "invoice_date"),
          read(invoice, "total_cents") == null ? "—" : money(read(invoice, "total_cents"))]
          .forEach((text) => { row.insertCell().textContent = text ?? ""; });
        const actions = row.insertCell();
        actions.className = "action-group";
        [["View", async () => { if (await openInvoice(invoice.id) !== false) showPreview(); }], ["Edit", () => openInvoice(invoice.id)], ["Delete", () => deleteInvoice(invoice.id)]].forEach(([label, handler]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = label === "Delete" ? "button danger" : "button secondary";
          button.textContent = label;
          button.addEventListener("click", () => runAction(handler));
          actions.appendChild(button);
        });
      });
      setMessage("list-status", invoices.length ? "" : "No invoices on this page.");
    } catch (error) {
      setMessage("list-status", error.message, true);
    }
    updatePagination();
  }

  async function openInvoice(id) {
    if (dirty && !window.confirm("Discard unsaved changes and open this invoice?")) return false;
    const invoice = unwrap(await api.get(id));
    fillInvoice(invoice);
    setMessage("save-status", "Invoice loaded.");
  }

  async function deleteInvoice(id) {
    const warning = currentInvoice?.id === id && dirty
      ? "This invoice has unsaved changes. Deleting it will also discard those changes. This action cannot be undone."
      : "This invoice will be permanently deleted. This action cannot be undone.";
    if (!await window.confirmDelete(warning)) return;
    // Use the editor's version for an open invoice to preserve conflict detection.
    const invoice = currentInvoice?.id === id ? currentInvoice : unwrap(await api.get(id));
    if (!Number.isInteger(invoice?.version)) throw new Error("Missing invoice version. Deletion cancelled.");
    await api.remove(id, invoice.version);
    if (currentInvoice?.id === id) resetInvoice();
    setMessage("save-status", "Invoice deleted.");
    await loadInvoices();
    views.show("list");
  }

  function resetInvoice() {
    clearValidationErrors();
    form.reset();
    logo.reset();
    document.getElementById("document-conflict").hidden = true;
    each(form.elements, (input) => { if (input.setCustomValidity) input.setCustomValidity(""); });
    field("date").value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    services.textContent = "";
    addService();
    currentInvoice = null;
    saveBlocked = false;
    dirty = false;
    showEditor();
    updateEditorState();
    setMessage("save-status", "");
  }

  async function saveInvoice() {
    const payload = invoicePayload();
    setMessage("save-status", "Saving invoice...");
    const response = currentInvoice
      ? await api.update(currentInvoice.id, payload)
      : await api.create(payload);
    dirty = false;
    const saved = unwrap(response);
    const id = saved?.id ?? currentInvoice?.id;
    saveBlocked = true;
    if (id == null) throw new Error("Invoice saved. Reopen it from the list before editing again.");
    currentInvoice = { id, version: null };
    try { fillInvoice(unwrap(await api.get(id))); }
    catch (error) { saveBlocked = true; throw new Error(`Invoice saved, but its latest details could not be loaded. Reopen it before saving again. ${error.message}`); }
    views.show("list");
    await loadInvoices(1);
    setMessage("save-status", "");
    showFeedback("success", response?.message || "Invoice saved successfully.");
  }
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function field(name) { return form.elements.namedItem(name); }
  function value(name) { return field(name).value; }
  function pad(number) { return number < 10 ? "0" + number : String(number); }
  function money(cents) {
    var parts = (cents / 100).toFixed(2).split(".");
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + parts[1];
  }
  var today = new Date();
  field("date").value = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
  field("date").placeholder = "YYYY-MM-DD";
  function rows() {
    var entries = [];
    each(services.rows, function (row) {
      function get(key) { return row.querySelector('[data-field="' + key + '"]').value; }
      var days = Number(get("days")), rate = Number(get("rate"));
      // Both inputs have two decimal places: multiply integers, then round to cents.
      entries.push({consultant: get("consultant"), activity: get("activity"), month: get("month"), days: days, rateCents: Math.round(rate * 100), total: Math.floor((Math.round(days * 100) * Math.round(rate * 100) + 50) / 100)});
    });
    return entries;
  }
  function total(entries) {
    var sum = 0;
    each(entries, function (entry) { sum += entry.total; });
    return sum;
  }
  function updateTotals() {
    var entries = rows();
    each(entries, function (entry, index) { services.rows[index].querySelector("output").textContent = money(entry.total); });
    document.getElementById("grand-total").textContent = money(total(entries));
    each(services.querySelectorAll(".remove"), function (button) { button.disabled = services.rows.length === 1; });
  }
  function invalidate() {
    dirty = true;
    updateEditorState();
    document.body.classList.remove("print-ready");
    updateTotals();
  }
  function addService() {
    var row = services.insertRow(), id = ++nextId;
    each([["consultant", "Consultant", "text"], ["activity", "Activity", "text"], ["month", "Month", "month"], ["days", "Days", "number"], ["rate", "Daily rate in CHF", "number"]], function (definition) {
      var key = definition[0], type = definition[2], input = document.createElement("input");
      input.type = type;
      input.setAttribute("data-field", key);
      input.required = true;
      if (type === "month") {
        input.pattern = "[0-9]{4}-(0[1-9]|1[0-2])";
        input.placeholder = "YYYY-MM";
        input.title = "Enter a month as YYYY-MM, for example 2026-10";
        input.min = "1900-01"; input.max = "9999-12"; input.maxLength = 7;
      }
      input.setAttribute("aria-label", definition[1] + ", service " + id);
      if (type === "number") {
        input.min = "0"; input.max = key === "days" ? "366" : "100000000";
        input.step = "0.01"; input.value = "0";
        input.setAttribute("inputmode", "decimal");
      } else if (type === "text") { input.maxLength = key === "activity" ? 500 : 200; }
      row.insertCell().appendChild(input);
    });
    var output = document.createElement("output");
    output.className = "line-total"; row.insertCell().appendChild(output);
    var remove = document.createElement("button");
    remove.type = "button"; remove.className = "remove"; remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove service " + id);
    remove.addEventListener("click", function () { row.parentNode.removeChild(row); invalidate(); });
    row.insertCell().appendChild(remove); updateTotals(); return row;
  }
  function clearValidationErrors() {
    form.querySelectorAll(".field-error").forEach((element) => element.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach((input) => {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    });
  }

  function renderValidationErrors() {
    clearValidationErrors();
    const invalidInputs = Array.from(form.querySelectorAll("input, textarea"))
      .filter((input) => !input.validity.valid);
    if (!invalidInputs.length) return true;

    invalidInputs.forEach((input, index) => {
      const message = input.required && !input.value.trim()
        ? "This field is required."
        : input.validationMessage;
      const error = document.createElement("span");
      error.id = `field-error-${index}`;
      error.className = "field-error";
      error.textContent = message;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
      input.insertAdjacentElement("afterend", error);
    });
    showEditor();
    invalidInputs[0].focus({ preventScroll: true });
    invalidInputs[0].scrollIntoView({ block: "center", behavior: "smooth" });
    return false;
  }

  function validate() {
    each(form.querySelectorAll('input[required][type="text"], textarea[required], input[required]:not([type])'), function (input) {
      input.setCustomValidity(input.value.trim() ? "" : "Please enter a value.");
    });
    each(services.querySelectorAll('[data-field="month"]'), function (input) {
      input.setCustomValidity(/^(19|[2-9][0-9])[0-9]{2}-(0[1-9]|1[0-2])$/.test(input.value) ? "" : "Enter a valid month as YYYY-MM (1900-9999).");
    });
    each(services.querySelectorAll('[data-field="days"], [data-field="rate"]'), function (input) {
      var number = Number(input.value);
      input.setCustomValidity(/^\d+(\.\d{1,2})?$/.test(input.value) && isFinite(number) && number <= Number(input.max) ? "" : "Enter a non-negative number with up to two decimal places, no greater than " + input.max + ".");
    });
    var date = value("date"), match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    var parsed = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
    field("date").setCustomValidity(match && Number(match[1]) >= 1000 && parsed.getFullYear() === Number(match[1]) && parsed.getMonth() === Number(match[2]) - 1 && parsed.getDate() === Number(match[3]) ? "" : "Enter a valid date as YYYY-MM-DD (year 1000-9999).");
    return renderValidationErrors();
  }

  function showPreview() {
    if (!validate()) return false;
    var entries = rows();
    each(preview.querySelectorAll("[data-value]"), function (element) { element.textContent = value(element.getAttribute("data-value")) || ""; });
    var body = document.getElementById("preview-services"); body.textContent = "";
    each(entries, function (entry, index) {
      var row = body.insertRow(), parts = entry.month.split("-");
      each([index + 1, entry.consultant, entry.activity, months[Number(parts[1]) - 1] + " " + parts[0], entry.days, money(entry.rateCents), money(entry.total)], function (text) { row.insertCell().textContent = text; });
    });
    document.getElementById("preview-total").textContent = money(total(entries));
    var details = document.getElementById("payment-details"); details.textContent = "";
    each([["accountName", "Account Name"], ["bankName", "Bank Name"], ["iban", "Account No / IBAN"], ["swift", "IFSC / SWIFT"], ["branch", "Branch"]], function (definition) {
      if (!value(definition[0])) return;
      var term = document.createElement("dt"), description = document.createElement("dd");
      term.textContent = definition[1]; description.textContent = value(definition[0]);
      details.appendChild(term); details.appendChild(description);
    });
    var contacts = [];
    each(["phone", "fromAddress", "fromCity", "website", "email"], function (name) { if (value(name)) contacts.push(value(name)); });
    document.getElementById("contact-details").textContent = contacts.join(" \u00b7 ");
    form.hidden = true; preview.hidden = false; document.getElementById("preview-button").hidden = true;
    document.getElementById("status").textContent = "";
    document.body.classList.add("print-ready");
    views?.show("preview", currentInvoice?.id);
    document.getElementById("edit-button").focus(); window.scrollTo(0, 0);
    return true;
  }
  function onInput(event) {
    if (event.target.setCustomValidity) event.target.setCustomValidity("");
    if (event.target.hasAttribute("aria-invalid")) {
      const error = document.getElementById(event.target.getAttribute("aria-describedby"));
      if (error) error.remove();
      event.target.removeAttribute("aria-invalid");
      event.target.removeAttribute("aria-describedby");
    }
    invalidate();
  }
  form.addEventListener("input", onInput);
  form.addEventListener("change", onInput);
  document.getElementById("add-service").addEventListener("click", function () { addService().querySelector("input").focus(); invalidate(); });
  // Run our validation even when a browser falls back to text date/month/number controls.
  form.noValidate = true;
  form.addEventListener("submit", function (event) { event.preventDefault(); showPreview(); });
  document.getElementById("preview-button").addEventListener("click", function () { if (!form.hidden) showPreview(); });
  document.getElementById("edit-button").addEventListener("click", function () {
    showEditor();
    document.body.classList.remove("print-ready"); field("number").focus();
  });
  document.getElementById("print-button").addEventListener("click", () => runAction(async () => { if (showPreview()) { await logo.ready(); window.print(); } }));
  window.addEventListener("beforeunload", function (event) { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  addService();
  document.getElementById("save-invoice").addEventListener("click", () => {
    if (busy) return;
    setMessage("save-status", "");
    if (saveBlocked) {
      setMessage("save-status", "Reopen the saved invoice from the list before saving again.", true);
      return;
    }
    if (currentInvoice && !Number.isInteger(currentInvoice.version)) {
      setMessage("save-status", "Reopen this invoice to obtain its latest version before saving.", true);
      return;
    }
    if (!validate()) return;
    const button = document.getElementById("save-invoice");
    button.textContent = "Saving invoice…";
    runAction(saveInvoice).finally(updateEditorState);
  });
  document.getElementById("new-invoice").addEventListener("click", () => {
    if (!dirty || window.confirm("Discard unsaved changes and create a new invoice?")) resetInvoice();
  });
  document.getElementById("refresh-invoices").addEventListener("click", () => runAction(() => loadInvoices()));
  document.getElementById("previous-page").addEventListener("click", () => runAction(() => loadInvoices(page - 1)));
  document.getElementById("next-page").addEventListener("click", () => runAction(() => loadInvoices(page + 1)));
  document.getElementById("document-reload").addEventListener("click", () => runAction(async () => {
    if (currentInvoice && confirm("Discard this draft and reload? Download it first if needed.")) fillInvoice(unwrap(await api.get(currentInvoice.id)));
  }));
  document.getElementById("document-draft").addEventListener("click", () => downloadDocumentDraft(invoicePayload()));
  views = window.createDocumentViews({
    label: "Invoice", plural: "Invoices", library: ".invoice-library", form: "invoice-form",
    editorOnly: ["#editor-state", ".editor-actions"], dirty: () => dirty, busy: () => busy,
    discard: () => { dirty = false; }, reset: resetInvoice, open: openInvoice,
    preview: showPreview, run: runAction, refresh: () => runAction(() => loadInvoices())
  });
  runAction(async () => { await loadInvoices(); await views.restore(); });
})();
