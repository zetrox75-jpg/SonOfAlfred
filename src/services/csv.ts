// Minimal RFC 4180 CSV. The delimiter is detected from the header line, because
// Excel in French locales saves CSV with ";" instead of ",".

export interface CsvTable {
  headers: string[];
  /** Data rows as objects keyed by header. `line` is the 1-based file line of the row start. */
  rows: { line: number; values: Record<string, string> }[];
}

export function detectDelimiter(text: string): "," | ";" {
  const header = text.slice(0, text.search(/\r?\n|$/));
  return (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ",";
}

/** Parses into raw records. Throws on an unterminated quoted field. */
export function parseCsvRecords(text: string, delimiter = detectDelimiter(text)): { line: number; fields: string[] }[] {
  const src = text.replace(/^﻿/, "");
  const out: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) fields.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      fields.push(field);
      out.push({ line: start, fields });
      fields = [];
      field = "";
      start = ++line;
    } else field += c;
  }
  if (quoted) throw new Error(`Unterminated quoted field starting on line ${start}`);
  if (field !== "" || fields.length) fields.push(field), out.push({ line: start, fields });
  return out.filter((r) => r.fields.some((f) => f.trim() !== ""));
}

export function parseCsv(text: string): CsvTable {
  const [head, ...data] = parseCsvRecords(text);
  if (!head) return { headers: [], rows: [] };
  const headers = head.fields.map((h) => h.trim().toLowerCase());
  return {
    headers,
    rows: data.map((r) => ({
      line: r.line,
      values: Object.fromEntries(headers.map((h, i) => [h, (r.fields[i] ?? "").trim()])),
    })),
  };
}

const quote = (v: string) => (/[",;\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);

const cell = (v: unknown) => (v == null ? "" : String(v));

/** Always writes "," with CRLF and a BOM so Excel opens UTF-8 correctly. */
export function toCsv(headers: string[], rows: object[]): string {
  const lines = [headers, ...rows.map((r) => headers.map((h) => cell((r as Record<string, unknown>)[h])))];
  return "﻿" + lines.map((l) => l.map(quote).join(",")).join("\r\n") + "\r\n";
}
