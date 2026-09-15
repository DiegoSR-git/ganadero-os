// Utilidades para generar y descargar CSV en navegador
function escape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows: Record<string, any>[], headers?: string[]): string {
  if (!rows.length) return "";
  const cols = headers ?? Object.keys(rows[0]);
  const head = cols.join(";");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(";")).join("\n");
  // BOM para que Excel reconozca UTF-8
  return "\uFEFF" + head + "\n" + body;
}

export function downloadCSV(filename: string, rows: Record<string, any>[], headers?: string[]) {
  const csv = toCSV(rows, headers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
