"use strict";
if (!window.TIMESHEET_USER) throw new Error("Login is required.");
const $ = id => document.getElementById(id), api = window.timesheetApi;
let loadGeneration = 0, conflict = false;
const company = window.createTimesheetCompany(() => {
  monthDirty = true;
  $("month-state").textContent = "Unsaved changes";
});
function companyValues() { return company.values(); }
function mapRecord(row) {
  if (!row || row.id == null || typeof row.work_date !== "string" || ![0,0.5,1].includes(Number(row.days))) throw new Error("Unexpected Timesheet record format. Expected work_date, days, location, phase and task_notes.");
  return {id:row.id,workDate:row.work_date.slice(0,10),days:Number(row.days),location:row.location ?? "",phase:row.phase ?? "",taskNotes:row.task_notes ?? ""};
}
let busy=false;
const now=new Date(), from=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
const monthNames=["January","February","March","April","May","June","July","August","September","October","November","December"];
function relativeMonth(offset=0, today=new Date()) {
  const date=new Date(today.getFullYear(),today.getMonth()+offset,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}
function updateMonthShortcuts() {
  $("current-month").setAttribute("aria-pressed",String($("month-picker").value===relativeMonth()));
  $("last-month").setAttribute("aria-pressed",String($("month-picker").value===relativeMonth(-1)));
}
const store={async list(from,to,page) {
  const result=await api(`/api/timesheets?${new URLSearchParams({from,to,page,pageSize:100})}`);
  if (!Array.isArray(result?.items) || !Number.isInteger(result.total)) throw new Error("Invalid monthly response.");
  return {...result,items:result.items.map(mapRecord)};
}};
function message(text) { $("status").textContent=text; }
function controls() {
  document.querySelectorAll("#timesheet-app .timesheet-parties input,#timesheet-app .timesheet-parties textarea,#company-logo-remove,#month-form input,#month-form select,#month-form textarea,#month-form button,#month-select,#year-select,#current-month,#last-month").forEach(e=>e.disabled=busy || !monthReady || !window.TIMESHEET_USER);
  $("save-month").disabled=busy || !monthReady || conflict || !window.TIMESHEET_USER;
  $("export-button").disabled=busy || !monthReady || !window.TIMESHEET_USER;
}
async function run(action) {
  if (busy || !window.TIMESHEET_USER) return;
  busy=true; controls(); message("");
  try { await action(); } catch(error) {
    message(error.message);
    if (error.status === 409) { conflict = true; $("month-conflict").hidden = false; }
  }
  finally { busy=false; controls(); }
}
let monthReady = false, monthDirty = false;
$("month-picker").value = from.slice(0,7);
monthNames.forEach((name,index)=> {
  const option=document.createElement("option"); option.value=String(index+1).padStart(2,"0"); option.textContent=name; $("month-select").append(option);
});
$("month-select").value=from.slice(5,7); $("year-select").value=from.slice(0,4);
function updateMonthlySummary() {
  let days=0, filled=0;
  for (const row of $("month-rows").rows) {
    const value=row.querySelector('[name="days"]').value;
    if (value!=="") { days+=Number(value); filled++; }
  }
  $("month-total").textContent=days;
  $("month-filled").textContent=`${filled} filled rows`;
}
function monthlyBody(row) {
  const value = name => row.querySelector(`[name="${name}"]`).value;
  return {id:row.dataset.id ? Number(row.dataset.id) : null,workDate:row.dataset.date,days:Number(value("days")),location:value("location"),phase:value("phase"),taskNotes:value("taskNotes")};
}
async function loadMonth(force = false) {
  if (monthDirty && !force) return;
  monthReady = false;
  const requestGeneration = ++loadGeneration;
  const month = $("month-picker").value;
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Choose a month.");
  const [year,number] = month.split("-").map(Number);
  const count = new Date(year,number,0).getDate(), start = `${month}-01`, end = `${month}-${count}`;
  const details = company.validate(await api(`/api/timesheets/month-details?period=${encodeURIComponent(month)}`), month);
  let records = [], current = 1;
  while (true) {
    const result = await store.list(start,end,current++);
    records.push(...result.items);
    if (records.length >= result.total) break;
    if (!result.items.length) throw new Error("Unable to load all monthly records.");
  }
  if (requestGeneration !== loadGeneration || month !== $("month-picker").value || !window.TIMESHEET_USER) return;
  if (records.some(record => !record.workDate.startsWith(month + "-"))) throw new Error("The API returned records outside the selected month.");
  await company.apply(details);
  if (requestGeneration !== loadGeneration || !window.TIMESHEET_USER) return;
  conflict = false; $("month-conflict").hidden = true;
  $("month-rows").replaceChildren();
  for (let day=1;day<=count;day++) {
    const date = `${month}-${String(day).padStart(2,"0")}`;
    const entries = records.filter(r=>r.workDate===date);
    for (const entry of entries.length ? entries : [{workDate:date,days:"",location:"",phase:"",taskNotes:""}]) {
      const row = document.createElement("tr"); row.dataset.date=date;
      const weekday=new Date(year,number-1,day).getDay();
      if (weekday===0 || weekday===6) row.classList.add("weekend-row");
      if (entry.id != null) row.dataset.id=entry.id;
      const dateCell=document.createElement("td"); dateCell.textContent=date;
      const dayLabel=document.createElement("span"); dayLabel.className="weekday-label";
      dayLabel.textContent=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][weekday];
      dateCell.append(dayLabel); row.append(dateCell);
      for (const name of ["days","location","phase","taskNotes"]) {
        const cell=document.createElement("td"), input=document.createElement(name==="days" ? "select" : name==="taskNotes" ? "textarea" : "input");
        cell.dataset.label={days:"Days",location:"Location",phase:"Phase",taskNotes:"Task Notes"}[name];
        input.name=name; input.setAttribute("aria-label",`${name} for ${date}`);
        if (name==="days") for (const value of ["", "1", "0.5", "0"]) { const option=document.createElement("option"); option.value=value; option.textContent=value==="" ? "\u2014" : value; input.append(option); }
        else input.maxLength=name==="taskNotes" ? 5000 : 150;
        input.value=entry[name]; cell.append(input); row.append(cell);
      }
      const actions=document.createElement("td"), clear=document.createElement("button");
      clear.type="button"; clear.className="month-clear"; clear.textContent="Clear";
      clear.setAttribute("aria-label",`Clear entry for ${date}`);
      clear.addEventListener("click",()=> {
        row.querySelectorAll("input,select,textarea").forEach(input=>input.value="");
        row.dataset.cleared="true"; monthDirty=true; updateMonthlySummary();
        $("month-state").textContent="Unsaved changes - click Save month to apply.";
      });
      actions.append(clear); row.append(actions);
      row.dataset.original=JSON.stringify(monthlyBody(row));
      $("month-rows").append(row);
    }
  }
  $("monthly-title").textContent=`${monthNames[number-1]} ${year} timesheet`;
  updateMonthShortcuts();
  updateMonthlySummary(); monthReady=true; monthDirty=false; $("month-state").textContent=""; controls();
}
$("month-form").addEventListener("input",()=> { monthDirty=true; updateMonthlySummary(); $("month-state").textContent="Unsaved changes"; });
async function changeMonth() {
  if (busy) return;
  const previous=$("month-picker").value;
  if (!$("year-select").reportValidity() || (monthDirty && !confirm("Discard unsaved monthly changes?"))) {
    $("month-select").value=previous.slice(5,7); $("year-select").value=previous.slice(0,4); return;
  }
  $("month-picker").value=`${String($("year-select").value).padStart(4,"0")}-${$("month-select").value}`;
  run(()=>loadMonth(true));
}
$("month-select").addEventListener("change",changeMonth);
$("year-select").addEventListener("change",changeMonth);
function openRelativeMonth(offset) {
  if (busy || !window.TIMESHEET_USER) return;
  const month=relativeMonth(offset);
  if (month===$("month-picker").value && monthReady) return;
  $("month-select").value=month.slice(5,7); $("year-select").value=month.slice(0,4);
  changeMonth();
}
$("current-month").addEventListener("click",()=>openRelativeMonth(0));
$("last-month").addEventListener("click",()=>openRelativeMonth(-1));
$("month-form").addEventListener("submit",event=> {
  event.preventDefault(); if (busy || conflict || !monthReady || !company.valid() || !$("month-form").reportValidity()) return;
  const rows=[...$("month-rows").rows], entries=[], deleteIds=[];
  for (const row of rows) {
    const body=monthlyBody(row), days=row.querySelector('[name="days"]').value;
    if (!body.workDate.startsWith($("month-picker").value + "-")) { message("Entry does not belong to the selected month."); return; }
    if (!days && row.dataset.cleared && body.id != null && !body.location && !body.phase && !body.taskNotes) { deleteIds.push(body.id); continue; }
    if (!days && (body.id != null || body.location || body.phase || body.taskNotes)) { message(`Choose working days for ${body.workDate}.`); return; }
    if (days && JSON.stringify(body)!==row.dataset.original) entries.push(body);
  }
  const detailsChanged = company.dirty();
  if (!entries.length && !deleteIds.length && !detailsChanged) { $("month-state").textContent="No changes to save."; return; }
  if (entries.length > 100) { message("Save up to 100 changed entries at a time."); return; }
  run(async()=> {
    const period = $("month-picker").value;
    const body = { entries, deleteIds };
    if (detailsChanged) { body.period = period; body.monthDetails = company.payload(); }
    const result=await api("/api/timesheets/batch",{method:"POST",body:JSON.stringify(body)});
    if (!window.TIMESHEET_USER) return;
    if (!Array.isArray(result?.items) || result.items.length !== entries.length) throw new Error("Unexpected batch response. Preserve your draft and reload before saving again.");
    const saved = result.items.map(mapRecord);
    if (saved.some(record => !record.workDate.startsWith(period + "-"))) throw new Error("Unexpected saved record month.");
    const changedRows = rows.filter(row => row.querySelector('[name="days"]').value && JSON.stringify(monthlyBody(row)) !== row.dataset.original);
    for (const row of changedRows) {
      const index = saved.findIndex(record => record.workDate === row.dataset.date && (row.dataset.id == null || String(record.id) === row.dataset.id));
      if (index < 0) throw new Error("Unable to reconcile saved records. Reload before saving again.");
      const record = saved.splice(index, 1)[0];
      row.dataset.id = record.id;
      for (const name of ["days", "location", "phase", "taskNotes"]) row.querySelector(`[name="${name}"]`).value = record[name];
      row.dataset.original = JSON.stringify(monthlyBody(row));
    }
    for (const row of rows) if (deleteIds.includes(Number(row.dataset.id))) {
      delete row.dataset.id; delete row.dataset.cleared; row.dataset.original = JSON.stringify(monthlyBody(row));
    }
    if (result.monthDetails) await company.apply(company.validate(result.monthDetails, period));
    else if (detailsChanged) throw new Error("Saved response is missing monthly details. Reload before saving again.");
    monthDirty = false; updateMonthlySummary();
    $("month-state").textContent="Month saved.";
  });
});
window.addEventListener("timesheet-before-logout",event=> {
  if (busy) { message("Please wait until saving or loading finishes."); event.preventDefault(); }
  else if (monthDirty && !confirm("Log out and discard unsaved changes?")) event.preventDefault();
});
window.addEventListener("beforeunload",event=> { if (monthDirty) { event.preventDefault(); event.returnValue=""; } });
window.addEventListener("timesheet-session-expired",()=> { monthReady=false; monthDirty=false; loadGeneration++; company.clear(); $("month-rows").replaceChildren(); updateMonthlySummary(); $("month-state").textContent=""; controls(); });
$("export-button").addEventListener("click",()=> run(async () => {
  if (!window.ExcelJS) throw new Error("Excel library unavailable. Reload the page.");
  if (!monthReady || !window.TIMESHEET_USER || !company.valid()) return;
  const logo = await company.exportLogo();
  if (!window.TIMESHEET_USER) return;
  const entries=[...$("month-rows").rows].filter(row=>row.querySelector('[name="days"]').value!=="").map(monthlyBody);
  const workbook = await window.buildTimesheetWorkbook({ period: $("month-picker").value, details: company.payload(), entries, logo });
  const buffer = await workbook.xlsx.writeBuffer();
  if (!window.TIMESHEET_USER) return;
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = `Timesheet-${$("month-picker").value}.xlsx`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
$("company-logo-file").addEventListener("change", () => run(() => company.upload()));
$("reload-month").addEventListener("click", () => {
  if (confirm("Discard the draft and load the server version? Download your draft first if needed.")) run(() => loadMonth(true));
});
$("download-month-draft").addEventListener("click", () => {
  const draft = { period: $("month-picker").value, monthDetails: company.payload(), rows: [...$("month-rows").rows].map(row => ({ ...monthlyBody(row), days: row.querySelector('[name="days"]').value, cleared: row.dataset.cleared === "true" })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `Timesheet-draft-${draft.period}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener("timesheet-login",()=>run(()=>loadMonth(true)));
run(()=>loadMonth(true));
