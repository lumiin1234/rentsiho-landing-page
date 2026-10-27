"use strict";
window.buildTimesheetWorkbook = async function ({ period, details, entries, logo }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rentsiho";
  const sheet = workbook.addWorksheet("Timesheet", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  sheet.columns = [{ width: 18 }, { width: 12 }, { width: 27 }, { width: 27 }, { width: 62 }];
  sheet.mergeCells("A1:D2");
  sheet.getCell("A1").value = "MONTHLY TIMESHEET";
  sheet.getCell("A1").font = { size: 20, bold: true, color: { argb: "FF0B1B29" } };
  sheet.mergeCells("A3:D3"); sheet.getCell("A3").value = period;
  for (let row = 1; row <= 4; row++) sheet.getRow(row).height = 22;
  if (logo) {
    // Normalize WebP/JPEG to PNG in memory for Excel image compatibility.
    const image = await createImageBitmap(logo);
    let png;
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 600 / image.width, 300 / image.height);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      png = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to convert company logo.")), "image/png"));
      const fit = Math.min(160 / image.width, 80 / image.height);
      const id = workbook.addImage({ buffer: await png.arrayBuffer(), extension: "png" });
      sheet.addImage(id, { tl: { col: 4, row: 0 }, ext: { width: image.width * fit, height: image.height * fit }, editAs: "oneCell" });
    } finally { image.close(); }
  }
  sheet.addRow([]);
  for (const [label, value] of [
    ["From", details.fromCompanyName], ["Address", details.fromAddress], ["Email", details.fromEmail],
    ["To", details.toCompanyName], ["Address", details.toAddress], ["Email", details.toEmail]
  ]) {
    const row = sheet.addRow([label, value || ""]);
    sheet.mergeCells(row.number, 2, row.number, 5);
    row.getCell(1).font = { bold: true };
    row.height = Math.max(22, 16 * Math.ceil(String(value || "").length / 95));
    row.alignment = { vertical: "top", wrapText: true };
  }
  sheet.addRow([]);
  const header = sheet.addRow(["Date", "Days", "Location", "Phase", "Task Notes"]);
  header.height = 26;
  header.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1B29" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  for (const entry of entries) {
    const row = sheet.addRow([entry.workDate, entry.days, entry.location, entry.phase, entry.taskNotes]);
    row.alignment = { wrapText: true, vertical: "top" };
    row.getCell(2).numFmt = "0.##";
    const lines = Math.max(...[entry.location, entry.phase, entry.taskNotes].map((text, index) =>
      String(text || "").split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (index === 2 ? 58 : 24))), 0)));
    row.height = Math.max(24, 15 * lines);
  }
  const total = sheet.addRow(["Total working days", entries.reduce((sum, entry) => sum + entry.days, 0)]);
  total.font = { bold: true }; total.getCell(2).numFmt = "0.##";
  sheet.views = [{ state: "frozen", ySplit: header.number }];
  sheet.pageSetup.printTitlesRow = `${header.number}:${header.number}`;
  return workbook;
};
