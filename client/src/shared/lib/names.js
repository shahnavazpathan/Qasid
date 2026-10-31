// Normalises company names so registrar listings ("[KFIN] Foo Ltd") match exchange data ("Foo Limited").
// "&" and "AND" are the same word - sources write "Bombay Coated & Special Steels" and
// "Bombay Coated and Special Steels Ltd.", so one must become the other or they look like two IPOs.
export function normName(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/&/g, " AND ")
    .replace(/\b(LIMITED|LTD|PRIVATE|PVT|IPO|SME|NCD|INDIA|THE|AND)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function displayName(name) {
  return String(name || "").replace(/^\[[^\]]+\]\s*/, "");
}

export function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
