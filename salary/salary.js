"use strict";

(async () => {
  if (window.workspaceSession && !await window.workspaceSession.ready) return;
  const $ = (id) => document.getElementById(id);
  const form = $("salary-form");
  const api = window.salaryApi;
  let version = null, busy = false, page = 1, totalCount = 0, activePeriod = "", saveBlocked = false;
  const fieldNames = ["reference", "period", "paymentDate", "companyName", "companyAddress", "companyEmail", "employeeName", "employeeAddress", "position", "basis", "quantity", "rate", "bonus", "deductions", "notes"];
  let currentId = null;
  let dirty = false;
  let records = [];

  const field = (name) => form.elements.namedItem(name);
  const money = (cents) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Keep rates and money in integer cents, and quantities in hundredths.
  function calculate(values) {
    const quantity = Math.round(Number(values.quantity || 0) * 100);
    const rate = Math.round(Number(values.rate || 0) * 100);
    const base = Number.isSafeInteger(quantity) && Number.isSafeInteger(rate)
      ? Number((BigInt(quantity) * BigInt(rate) + 50n) / 100n)
      : 0;
    const bonus = Math.round(Number(values.bonus || 0) * 100);
    const deductions = Math.round(Number(values.deductions || 0) * 100);
    return { base, bonus, deductions, gross: base + bonus, net: base + bonus - deductions };
  }

  function values() {
    return Object.fromEntries(fieldNames.map((name) => [name, field(name).value.trim()]));
  }

  function message(text, error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
  }

  function updateTotals() {
    const hourly = field("basis").value === "hour";
    $("quantity-label").textContent = hourly ? "Hours worked" : "Days worked";
    $("rate-label").textContent = hourly ? "Hourly rate (CHF)" : "Daily rate (CHF)";
    const totals = calculate(values());
    $("base-total").textContent = money(totals.base);
    $("gross-total").textContent = money(totals.gross);
    $("net-total").textContent = money(totals.net);
    $("editor-state").textContent = `${currentId ? "Editing salary" : "New salary"} · ${dirty ? "Unsaved changes" : currentId ? "Saved" : "Not saved yet"}`;
  }

  function clearErrors() {
    form.querySelectorAll(".field-error").forEach((element) => element.remove());
    fieldNames.forEach((name) => {
      const input = field(name);
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    });
  }

  function validate() {
    clearErrors();
    fieldNames.forEach((name) => {
      const input = field(name);
      if (input.required && !input.value.trim()) input.setCustomValidity("This field is required.");
      if (input.type === "number" && input.value && !/^\d+(\.\d{1,2})?$/.test(input.value)) {
        input.setCustomValidity("Enter a non-negative number with up to two decimal places.");
      }
    });
    if (calculate(values()).net < 0) field("deductions").setCustomValidity("Deductions cannot exceed gross pay.");
    const invalid = fieldNames.map(field).filter((input) => !input.validity.valid);
    if (!invalid.length) return true;
    invalid.forEach((input, index) => {
      const error = document.createElement("span");
      error.id = `salary-error-${index}`;
      error.className = "field-error";
      error.textContent = input.validationMessage;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
      input.insertAdjacentElement("afterend", error);
    });
    showEditor();
    invalid[0].focus({ preventScroll: true });
    invalid[0].scrollIntoView({ block: "center", behavior: "smooth" });
    return false;
  }

  let views;
  function showEditor() {
    views?.show(currentId !== null ? "edit" : "new", currentId);
    form.hidden = false;
    $("preview").hidden = true;
    $("preview-button").hidden = false;
    document.body.classList.remove("print-ready");
  }

  function preview() {
    if (!validate()) return;
    const data = values();
    const totals = calculate(data);
    document.querySelectorAll("[data-value]").forEach((element) => {
      element.textContent = data[element.dataset.value] || (element.dataset.value === "notes" ? "—" : "");
    });
    const body = $("preview-calculation");
    body.textContent = "";
    const unit = data.basis === "hour" ? "hours" : "days";
    [
      ["Base pay", `${data.quantity} ${unit}`, money(Math.round(Number(data.rate) * 100)), money(totals.base)],
      ["Bonus", "—", "—", money(totals.bonus)],
      ["Gross pay", "—", "—", money(totals.gross)],
      ["Deductions", "—", "—", `−${money(totals.deductions)}`]
    ].forEach((cells) => {
      const row = body.insertRow();
      cells.forEach((text) => { row.insertCell().textContent = text; });
    });
    $("preview-net").textContent = money(totals.net);
    form.hidden = true;
    $("preview").hidden = false;
    $("preview-button").hidden = true;
    document.body.classList.add("print-ready");
    views?.show("preview", currentId);
    $("edit-button").focus();
    $("preview").scrollIntoView({ block: "start" });
  }

  function payload() {
    const data = values();
    const result = { reference: data.reference, salaryPeriod: `${data.period}-01`, currency: "CHF" };
    for (const name of ["paymentDate", "companyName", "companyAddress", "companyEmail", "employeeName", "employeeAddress", "position", "basis", "notes"]) result[name] = data[name] || null;
    for (const [name, key] of [["quantity", "quantityHundredths"], ["rate", "rateCents"], ["bonus", "bonusCents"], ["deductions", "deductionsCents"]]) result[key] = Math.round(Number(data[name] || 0) * 100);
    if (currentId !== null) result.version = version;
    return result;
  }
  function fill(record) {
    if (record?.id == null || !Number.isInteger(record.version)) throw new Error("Salary response must include id and version.");
    clearErrors();
    for (const name of fieldNames) field(name).value = record[name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] ?? "";
    field("period").value = String(record.salary_period || "").slice(0, 7);
    field("paymentDate").value = String(record.payment_date || "").slice(0, 10);
    for (const [name, key] of [["quantity", "quantity_hundredths"], ["rate", "rate_cents"], ["bonus", "bonus_cents"], ["deductions", "deductions_cents"]]) field(name).value = (record[key] ?? 0) / 100;
    currentId = record.id; version = record.version; saveBlocked = false; dirty = false;
    showEditor(); updateTotals();
  }
  function pagination() {
    $("page-label").textContent = `Page ${page}`;
    $("previous-page").disabled = busy || page <= 1;
    $("next-page").disabled = busy || page * 20 >= totalCount;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    const controls = Array.from(document.querySelectorAll("main button, main input, main textarea, main select"));
    const states = controls.map(input => input.disabled);
    controls.forEach(input => { input.disabled = true; });
    $("save-salary").textContent = "Please wait?";
    try { await action(); } catch (error) { message(error.message, true); }
    finally {
      controls.forEach((input, index) => { input.disabled = states[index]; });
      busy = false; pagination(); updateTotals();
      $("save-salary").textContent = currentId !== null ? "Save changes" : "Save salary";
    }
  }
  async function load(targetPage = page, period = activePeriod) {
    $("list-status").textContent = "Loading salaries?";
    try {
      const result = await api.list(targetPage, 20, period);
      if (!Array.isArray(result?.items) || !Number.isInteger(result.totalCount)) throw new Error("Invalid salary list response.");
      records = result.items; page = targetPage; activePeriod = period; totalCount = result.totalCount;
      renderList(); $("list-status").textContent = "";
    } catch (error) { $("list-status").textContent = error.message; }
    $("period-filter").value = activePeriod;
    pagination();
  }
  function renderList() {
    const body = $("saved-salaries"); body.textContent = "";
    $("empty-list").hidden = records.length > 0;
    records.forEach(record => {
      const row = body.insertRow();
      [record.reference, record.employee_name, String(record.salary_period).slice(0, 7), money(record.net_cents)].forEach(text => { row.insertCell().textContent = text; });
      const actions = row.insertCell(); actions.className = "action-group";
      for (const label of ["View", "Edit", "Delete"]) {
        const button = document.createElement("button"); button.type = "button";
        button.className = `button ${label === "Delete" ? "danger" : "secondary"}`; button.textContent = label;
        button.addEventListener("click", () => run(async () => {
          if (label === "View" || label === "Edit") {
            if (dirty && !confirm("Discard unsaved changes and open this salary?")) return;
            fill(await api.get(record.id)); message("Salary loaded.");
            if (label === "View") preview(); else field("reference").focus();
          } else {
            const warning = currentId === record.id && dirty
              ? "This salary has unsaved changes. Deleting it will also discard those changes. This action cannot be undone."
              : "This salary statement will be permanently deleted. This action cannot be undone.";
            if (!await window.confirmDelete(warning)) return;
            const expected = currentId === record.id ? version : record.version;
            if (!Number.isInteger(expected)) throw new Error("Refresh and reopen this salary before deleting.");
            await api.remove(record.id, expected);
            if (currentId === record.id) reset();
            message("Salary deleted."); await load(records.length === 1 && page > 1 ? page - 1 : page); views.show("list");
          }
        })); actions.appendChild(button);
      }
    });
  }

  function reset() {
    form.reset();
    clearErrors();
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    field("paymentDate").value = date;
    field("period").value = date.slice(0, 7);
    currentId = null;
    version = null; saveBlocked = false;
    dirty = false;
    showEditor();
    updateTotals();
    message("");
  }

  form.addEventListener("input", () => { clearErrors(); dirty = true; updateTotals(); });
  form.addEventListener("change", () => { clearErrors(); dirty = true; updateTotals(); });
  form.addEventListener("submit", (event) => { event.preventDefault(); preview(); });
  $("preview-button").addEventListener("click", preview);
  $("edit-button").addEventListener("click", () => { showEditor(); field("reference").focus(); });
  $("print-button").addEventListener("click", () => window.print());
  $("new-salary").addEventListener("click", () => {
    if (!dirty || confirm("Discard unsaved changes and start a new salary?")) reset();
  });
  $("save-salary").addEventListener("click", () => {
    if (busy) return;
    if (saveBlocked || (currentId !== null && !Number.isInteger(version))) { message("Reopen the saved salary before saving again.", true); return; }
    message(""); if (!validate()) return;
    run(async () => {
      message("Saving salary...");
      const data = payload();
      const result = currentId !== null ? await api.update(currentId, data) : await api.create(data);
      dirty = false;
      reset();
      views.show("list");
      await load(1);
      message(result?.message || "Salary saved successfully.");
    });
  });
  $("refresh-salaries").addEventListener("click", () => run(() => load()));
  $("previous-page").addEventListener("click", () => run(() => load(page - 1)));
  $("next-page").addEventListener("click", () => run(() => load(page + 1)));
  $("period-filter").addEventListener("change", () => {
    const period = $("period-filter").value; run(() => load(1, period));
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty) { event.preventDefault(); event.returnValue = ""; }
  });

  reset();
  views = window.createDocumentViews({
    label: "Salary", plural: "Salary statements", library: ".salary-library", form: "salary-form",
    dirty: () => dirty, busy: () => busy, discard: () => { dirty = false; }, reset,
    open: async id => fill(await api.get(id)), preview, run, refresh: () => run(() => load())
  });
  run(async () => { await load(); await views.restore(); });
})();
