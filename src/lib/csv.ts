// CSV files people open in Excel: quoted where needed, and safe from cells that
// would otherwise run as formulas.

export type CsvCell = string | number | null | undefined;

export function csvCell(value: CsvCell) {
  const text = value === null || value === undefined ? "" : String(value);
  // A leading = + - or @ would run as a formula when the file is opened in Excel.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: CsvCell[][]) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Saves the rows as a .csv file in the browser. */
export function downloadCsv(fileName: string, rows: CsvCell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
