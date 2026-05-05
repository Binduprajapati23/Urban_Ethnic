const escapeCsvCell = (value) => {
  const raw = value === null || value === undefined ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
};

export const downloadCsv = ({ filename, headers, rows }) => {
  const safeFilename = String(filename || "export.csv").trim() || "export.csv";
  const headerRow = Array.isArray(headers) ? headers.map(escapeCsvCell).join(",") : "";
  const bodyRows = Array.isArray(rows)
    ? rows.map((row) => (Array.isArray(row) ? row.map(escapeCsvCell).join(",") : "")).join("\n")
    : "";

  const content = [headerRow, bodyRows].filter(Boolean).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", safeFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

