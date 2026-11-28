/**
 * Spreadsheet untuk mode data contoh (E3b). Backend membaca XLSX dan CSV, meminta role merancang tabel,
 * lalu program mengisi dan menghitungnya; di sini rancangannya memakai pola tetap.
 */
import type { CellFormat, SheetPreview, SheetResult, SheetRow } from "@/app/(admin)/admin/tugas/types";
import type { MockTask } from "./engine";
import type { MockDatabase } from "./seed";

export type MockTable = { name: string; columns: string[]; rows: string[][] };

const PREVIEW_ROWS = 50;
const SHEET_TASK = /rekap|realisasi|spreadsheet|excel/i;

export const SAMPLE_TABLE: MockTable = {
  name: "Realisasi",
  columns: ["Bidang", "Kegiatan", "Pagu", "Realisasi"],
  rows: [
    ["Pelayanan", "Loket terpadu", "120000000", "98000000"],
    ["Pelayanan", "Layanan keliling", "80000000", "31000000"],
    ["Data", "Pemutakhiran basis data", "150000000", "132000000"],
    ["Data", "Pelatihan operator", "45000000", "18000000"],
    ["Umum", "Pemeliharaan gedung", "200000000", "164000000"],
    ["Umum", "Arsip digital", "60000000", "52000000"],
  ],
};

/** CSV sederhana: pemisah koma atau titik koma, tanda kutip dihormati */
export const parseCsv = (content: string): MockTable => {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const first = lines[0] ?? "";
  const separator = first.split(";").length > first.split(",").length ? ";" : ",";
  const cells = (line: string) => {
    const out: string[] = [];
    let current = "";
    let quoted = false;
    for (const c of line) {
      if (c === '"') quoted = !quoted;
      else if (c === separator && !quoted) {
        out.push(current.trim());
        current = "";
      } else current += c;
    }
    return [...out, current.trim()];
  };
  const [header = "", ...rest] = lines;
  const columns = cells(header);
  return { name: "Data", columns, rows: rest.map((l) => cells(l).slice(0, columns.length)) };
};

const numberOf = (value: string) => {
  const cleaned = value.replace(/rp|\s/gi, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return cleaned && !Number.isNaN(Number(cleaned)) ? Number(cleaned) : null;
};

const display = (value: number, format: CellFormat) =>
  format === "percent"
    ? new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 1 }).format(value)
    : format === "currency"
      ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value)
      : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);

export const buildSheet = (table: MockTable): SheetPreview => {
  const numeric = table.columns.map((_, i) => table.rows.length > 0 && table.rows.every((r) => !r[i] || numberOf(r[i]) !== null) && table.rows.some((r) => r[i]));
  const formats = table.columns.map((header, i): CellFormat => (!numeric[i] ? "text" : /pagu|anggaran|realisasi|biaya|harga|nilai/i.test(header) ? "currency" : "number"));
  const base = table.columns.findIndex((h, i) => numeric[i] && /pagu|anggaran|target/i.test(h));
  const done = table.columns.findIndex((h, i) => numeric[i] && /realisasi|capaian/i.test(h));
  const ratio = base >= 0 && done >= 0;
  const columns = table.columns.map((header, i) => ({ header, format: formats[i], formula: "" }));
  if (ratio) columns.push({ header: "Persentase", format: "percent", formula: `${table.columns[done]} ÷ ${table.columns[base]}` });

  let flagged = 0;
  const line = (values: (string | number)[], style: SheetRow["style"]): SheetRow => ({
    style,
    cells: values.map((v, i) => (typeof v === "number" ? display(v, columns[i].format) : v)),
  });
  const dataRow = (row: string[]) => {
    const values: (string | number)[] = table.columns.map((_, i) => (numeric[i] ? (numberOf(row[i] ?? "") ?? 0) : (row[i] ?? "")));
    if (!ratio) return line(values, "normal");
    const share = Number(values[base]) ? Number(values[done]) / Number(values[base]) : 0;
    if (share < 0.5) flagged++;
    return line([...values, share], share < 0.5 ? "flag" : "normal");
  };
  const summary = (label: string, rows: string[][], style: SheetRow["style"]) => {
    const values: (string | number)[] = table.columns.map((_, i) => (numeric[i] ? rows.reduce((s, r) => s + (numberOf(r[i] ?? "") ?? 0), 0) : i === 0 ? label : ""));
    if (ratio) values.push(Number(values[base]) ? Number(values[done]) / Number(values[base]) : 0);
    return line(values, style);
  };

  // Dikelompokkan menurut kolom pertama bila isinya berulang
  const keys = [...new Set(table.rows.map((r) => r[0]))];
  const grouped = !numeric[0] && keys.length > 1 && keys.length < table.rows.length;
  const shown = table.rows.slice(0, PREVIEW_ROWS);
  const rows: SheetRow[] = [];
  if (grouped) {
    for (const key of keys) {
      const mine = shown.filter((r) => r[0] === key);
      if (!mine.length) continue;
      rows.push(...mine.map(dataRow), summary(`Jumlah ${key}`, table.rows.filter((r) => r[0] === key), "subtotal"));
    }
  } else rows.push(...shown.map(dataRow));
  if (numeric.some(Boolean)) rows.push(summary("Jumlah seluruhnya", table.rows, "total"));
  return { name: table.name.slice(0, 31), columns, rows, row_count: table.rows.length, flagged, flag_rule: ratio ? "persentase di bawah 50%" : "" };
};

const csvFile = (sheet: SheetPreview) => {
  const quote = (v: string) => `"${(v.startsWith("=") ? `'${v}` : v).replaceAll('"', '""')}"`;
  const lines = [sheet.columns.map((c) => quote(c.header)).join(";"), ...sheet.rows.map((r) => r.cells.map(quote).join(";"))];
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${lines.join("\r\n")}`)}`;
};

/** Spreadsheet milik tugas rekap yang hasilnya sudah ada; dihitung setiap dibaca */
export const sheetsOf = (db: MockDatabase, task: MockTask): SheetResult[] => {
  if (!["waiting_approval", "completed"].includes(task.status) || !SHEET_TASK.test(`${task.title} ${task.brief}`)) return [];
  const files = db.task_attachments.filter((a) => (task.attachment_ids ?? []).includes(a.id) && a.tables?.length);
  const tables = files.flatMap((a) => a.tables ?? []);
  const sheets = (tables.length ? tables : [SAMPLE_TABLE]).map(buildSheet);
  return [
    {
      kind: "sheet",
      id: `sheet-${task.id}`,
      title: task.title,
      version: 1,
      processing: false,
      origin: tables.length ? "attachment" : "text",
      source_files: files.map((a) => a.file_name),
      sheets,
      composed: [],
      xlsx_url: csvFile(sheets[0]),
      checks: [
        { text: "Subtotal dan total dihitung program", passed: true, ref: "" },
        tables.length ? { text: `${tables.reduce((s, t) => s + t.rows.length, 0)} baris diambil dari berkas data`, passed: true, ref: "" } : { text: "Tidak ada berkas data; cocokkan angkanya dengan sumbernya", passed: false, ref: "" },
      ],
      created_at: task.created_at,
      updated_at: task.updated_at,
    },
  ];
};
