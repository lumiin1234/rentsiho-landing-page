"use strict";
if (!window.TIMESHEET_USER) throw new Error("Login is required.");
const $ = id => document.getElementById(id), api = window.timesheetApi;
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
  document.querySelectorAll("#month-form input,#month-form select,#month-form textarea,#month-form button,#month-select,#year-select,#current-month,#last-month").forEach(e=>e.disabled=busy || !window.TIMESHEET_USER);
  $("save-month").disabled=busy || !monthReady || !window.TIMESHEET_USER;
  $("export-button").disabled=busy || !monthReady || !window.TIMESHEET_USER;
}
async function run(action) {
  if (busy || !window.TIMESHEET_USER) return;
  busy=true; controls(); message("");
  try { await action(); } catch(error) { message(error.message); }
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
  const month = $("month-picker").value;
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Choose a month.");
  const [year,number] = month.split("-").map(Number);
  const count = new Date(year,number,0).getDate(), start = `${month}-01`, end = `${month}-${count}`;
  let records = [], current = 1;
  while (true) {
    const result = await store.list(start,end,current++);
    records.push(...result.items);
    if (records.length >= result.total) break;
    if (!result.items.length) throw new Error("Unable to load all monthly records.");
  }
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
  event.preventDefault(); if (!monthReady || !$("month-form").reportValidity()) return;
  const rows=[...$("month-rows").rows], entries=[], deleteIds=[];
  for (const row of rows) {
    const body=monthlyBody(row), days=row.querySelector('[name="days"]').value;
    if (!days && row.dataset.cleared && body.id != null && !body.location && !body.phase && !body.taskNotes) { deleteIds.push(body.id); continue; }
    if (!days && (body.id != null || body.location || body.phase || body.taskNotes)) { message(`Choose working days for ${body.workDate}.`); return; }
    if (days && JSON.stringify(body)!==row.dataset.original) entries.push(body);
  }
  if (!entries.length && !deleteIds.length) { $("month-state").textContent="No changes to save."; return; }
  if (entries.length > 100) { message("Save up to 100 changed entries at a time."); return; }
  run(async()=> {
    const result=await api("/api/timesheets/batch",{method:"POST",body:JSON.stringify({entries,deleteIds})});
    if (!Array.isArray(result?.items) || result.items.length!==entries.length) throw new Error("Unexpected batch response. Reload the month before saving again.");
    const saved=result.items.map(mapRecord);
    let index=0;
    for (const row of rows) if (row.querySelector('[name="days"]').value && JSON.stringify(monthlyBody(row))!==row.dataset.original) {
      row.dataset.id=saved[index++].id; row.dataset.original=JSON.stringify(monthlyBody(row));
    }
    monthDirty=false; $("month-state").textContent=`Saved ${saved.length} entries.`;
    await loadMonth(true);
    $("month-state").textContent="Month saved.";
  });
});
window.addEventListener("timesheet-before-logout",event=> {
  if (busy) { message("Please wait until saving or loading finishes."); event.preventDefault(); }
  else if (monthDirty && !confirm("Log out and discard unsaved changes?")) event.preventDefault();
});
window.addEventListener("beforeunload",event=> { if (monthDirty) { event.preventDefault(); event.returnValue=""; } });
window.addEventListener("timesheet-session-expired",()=> { monthReady=false; monthDirty=false; $("month-rows").replaceChildren(); updateMonthlySummary(); $("month-state").textContent=""; controls(); });
$("export-button").addEventListener("click",()=> {
  if (!window.XLSX) { message("Excel library unavailable. Reload the page."); return; }
  const entries=[...$("month-rows").rows].filter(row=>row.querySelector('[name="days"]').value!=="").map(monthlyBody);
  const rows=[["Date","Days","Location","Phase","Task Notes"],...entries.map(e=>[e.workDate,e.days,e.location,e.phase,e.taskNotes]),["Total working days",entries.reduce((sum,e)=>sum+e.days,0)]];
  const sheet=XLSX.utils.aoa_to_sheet(rows), book=XLSX.utils.book_new();
  sheet["!cols"]=[{wch:15},{wch:8},{wch:25},{wch:25},{wch:60}];
  XLSX.utils.book_append_sheet(book,sheet,"Timesheet"); XLSX.writeFile(book,`Timesheet-${$("month-picker").value}.xlsx`);
});
window.addEventListener("timesheet-login",()=>run(()=>loadMonth(true)));
run(()=>loadMonth(true));
