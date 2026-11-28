/**
 * Surat untuk mode data contoh (E3a): catatan format, nomor register, dan berkas hasil.
 * Backend membaca aturan dengan Gemini dan membuat DOCX serta PDF; di sini semuanya disimulasikan.
 */
import type { LetterFormat, Letterhead, LetterSample, NumberRegister } from "@/app/(admin)/admin/pengaturan/persuratan/types";
import type { ResultDocument } from "@/app/(admin)/admin/tugas/types";
import type { MockTask } from "./engine";
import type { MockDatabase } from "./seed";

export type MockLetterFormat = LetterFormat & { organization_id: string };
export type MockLetterhead = Letterhead & { organization_id: string };
export type MockRegister = Omit<NumberRegister, "preview"> & { organization_id: string };
export type MockSample = LetterSample & { organization_id: string };
export type MockResultFile = ResultDocument & { organization_id: string; task_id: string };

const LETTER = /surat|undangan|nota dinas|edaran/i;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export const numberOf = (pattern: string, next: number, at: string) =>
  pattern.replaceAll("[urut]", String(next).padStart(3, "0")).replaceAll("[bulan]", ROMAN[new Date(at).getMonth()]).replaceAll("[tahun]", String(new Date(at).getFullYear()));

const typeOf = (text: string) => (/undangan/i.test(text) ? "Surat Undangan" : /nota dinas/i.test(text) ? "Nota Dinas" : /edaran/i.test(text) ? "Surat Edaran" : "Surat Dinas");

const escapeXml = (value: string) => value.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Pecah teks panjang menjadi baris selebar kira-kira `width` huruf */
const wrap = (text: string, width = 78) => {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : lines;
};

const bodyOf = (task: MockTask) => [
  "Dengan hormat,",
  task.inputs.pokok_isi || task.brief || task.title,
  "Demikian disampaikan. Atas perhatian dan kehadirannya diucapkan terima kasih.",
];

type Letter = { organization: string; type: string; number: string | null; subject: string; to: string; paragraphs: string[]; ccLeft: boolean; date: string };

const renderPage = (l: Letter) => {
  let y = 210;
  const row = (value: string, x = 70, extra = "") => {
    const out = `<text x="${x}" y="${y}" ${extra}>${escapeXml(value)}</text>`;
    y += 22;
    return out;
  };
  const parts = [row(`Nomor  : ${l.number ?? "……… (diberikan saat disetujui)"}`), row(`Hal    : ${l.subject}`)];
  y += 14;
  parts.push(row("Yth. " + l.to), row("di Tempat"));
  y += 14;
  for (const p of l.paragraphs) {
    for (const line of wrap(p)) parts.push(row(line));
    y += 8;
  }
  y += 30;
  parts.push(row("Kepala Dinas,", 380));
  y += 60;
  parts.push(row("(nama pejabat berwenang)", 380));
  y += 30;
  const cc = l.ccLeft ? 70 : 380;
  parts.push(row("Tembusan:", cc), row("1. Arsip", cc));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="877" viewBox="0 0 620 877" font-family="serif" font-size="14" fill="#111">
    <rect width="620" height="877" fill="#fff"/>
    <text x="310" y="68" text-anchor="middle" font-size="19" font-weight="700">${escapeXml(l.organization.toUpperCase())}</text>
    <text x="310" y="90" text-anchor="middle" font-size="12">Jalan Contoh Nomor 1</text>
    <rect x="60" y="104" width="500" height="3" fill="#111"/>
    <text x="550" y="150" text-anchor="end">${escapeXml(l.date)}</text>
    <text x="310" y="178" text-anchor="middle" font-weight="700">${escapeXml(l.type.toUpperCase())}</text>
    ${parts.join("")}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s{2,}/g, " "))}`;
};

const wordFile = (l: Letter) => {
  const html = [`<h3 style="text-align:center">${escapeXml(l.organization.toUpperCase())}</h3><hr>`, `<p>Nomor: ${escapeXml(l.number ?? "")}<br>Hal: ${escapeXml(l.subject)}</p>`, `<p>Yth. ${escapeXml(l.to)}<br>di Tempat</p>`, ...l.paragraphs.map((p) => `<p>${escapeXml(p)}</p>`), "<p>Kepala Dinas,<br><br><br>(nama pejabat berwenang)</p>"].join("");
  return `data:application/msword;charset=utf-8,${encodeURIComponent(`<html><meta charset="utf-8"><body style="font-family:serif">${html}</body></html>`)}`;
};

const newFormat = (db: MockDatabase, org: string, name: string, at: string): MockLetterFormat => {
  const rule = db.documents.find((d) => d.organization_id === org && /naskah|persuratan|surat/i.test(d.title));
  const format: MockLetterFormat = {
    id: `format-${db.letter_formats.length + 1}-${name.toLowerCase().replace(/\W+/g, "-")}`,
    organization_id: org,
    name,
    paper: "F4 (215 × 330 mm)",
    margins: { top: 2, right: 2, bottom: 2.5, left: 3 },
    font: "Arial 12 pt",
    sections: ["Kop", "Tempat dan tanggal", "Nomor, sifat, lampiran, hal", "Tujuan", "Isi", "Tanda tangan", "Tembusan"],
    sources: rule
      ? [{ kind: "rule", title: rule.title, detail: "bagian susunan naskah", url: null, document_id: rule.id }]
      : [{ kind: "general", title: "Susunan surat dinas yang lazim", detail: "", url: null, document_id: null }],
    checked: false,
    corrections: [],
    updated_at: at,
  };
  db.letter_formats.push(format);
  return format;
};

const registerOf = (db: MockDatabase, org: string, name: string) => {
  let register = db.letter_registers.find((r) => r.organization_id === org && r.name === name);
  if (!register) {
    register = { id: `register-${db.letter_registers.length + 1}`, organization_id: org, name, pattern: "005/[urut]/DCN/[bulan]/[tahun]", next_number: 1, issued: [] };
    db.letter_registers.push(register);
  }
  return register;
};

/** Susun ulang tampilan berkas dari keadaan format, nomor, dan koreksi saat ini */
const draw = (db: MockDatabase, task: MockTask, doc: MockResultFile) => {
  const format = db.letter_formats.find((f) => f.id === doc.format_id);
  const letter: Letter = {
    organization: db.organizations.find((o) => o.id === task.organization_id)?.name ?? "Organisasi",
    type: doc.letter_type,
    number: doc.number,
    subject: task.inputs.perihal || task.title,
    to: task.inputs.tujuan || "Penerima surat",
    paragraphs: bodyOf(task),
    ccLeft: Boolean(format?.corrections.some((c) => /tembusan.*kiri/i.test(c.text))) || !format?.corrections.some((c) => /tembusan.*kanan/i.test(c.text)),
    date: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(doc.created_at)),
  };
  doc.pages = [renderPage(letter)];
  doc.docx_url = wordFile(letter);
  doc.format_checked = Boolean(format?.checked);
};

/** Berkas milik tugas surat; dibuat saat hasilnya ada, nomornya saat tugas selesai. */
export const documentsOf = (db: MockDatabase, task: MockTask): MockResultFile[] => {
  if (!["waiting_approval", "completed"].includes(task.status) || !LETTER.test(`${task.title} ${task.brief}`)) return [];
  const at = new Date().toISOString();
  let doc = db.task_documents.find((d) => d.task_id === task.id);
  if (!doc) {
    const type = typeOf(`${task.title} ${task.brief}`);
    const format = db.letter_formats.find((f) => f.organization_id === task.organization_id && f.name === type) ?? newFormat(db, task.organization_id, type, at);
    const official = format.sources.some((s) => s.kind === "rule" || s.kind === "sample");
    const ref = format.sources[0]?.title ?? "";
    doc = {
      id: `berkas-${db.task_documents.length + 1}`,
      organization_id: task.organization_id,
      task_id: task.id,
      title: task.title,
      letter_type: type,
      format_id: format.id,
      version: 1,
      number: null,
      pages: [],
      docx_url: null,
      pdf_url: null,
      sources: format.sources,
      format_checked: false,
      official,
      checks: [
        { text: "Kop, tanggal, hal, tujuan, dan blok tanda tangan ada", passed: true, ref: official ? ref : "" },
        { text: "Nomor diambil dari buku register saat disetujui", passed: true, ref: "Buku register" },
        { text: "Nama pejabat penanda tangan perlu diisi", passed: false, ref: official ? ref : "" },
      ],
      created_at: at,
      updated_at: at,
    };
    db.task_documents.push(doc);
  }
  if (task.status === "completed" && !doc.number) {
    const register = registerOf(db, task.organization_id, doc.letter_type);
    doc.number = numberOf(register.pattern, register.next_number, at);
    register.issued.unshift({ number: doc.number, title: task.title, task_id: task.id, issued_at: at });
    register.next_number += 1;
  }
  registerOf(db, task.organization_id, doc.letter_type);
  draw(db, task, doc);
  return [doc];
};

export const redraw = draw;
