/**
 * Laporan, notulen, dan proposal untuk mode data contoh (E3c). Backend membuat DOCX dan PDF dari susunan
 * yang ditulis role; di sini halamannya digambar sederhana.
 */
import type { ReportResult } from "@/app/(admin)/admin/tugas/types";
import type { MockTask } from "./engine";
import type { MockDatabase } from "./seed";

const REPORT = /laporan|notula|notulen|proposal/i;
const NOT_REPORT = /surat|undangan|nota dinas|edaran|excel|spreadsheet|rekap/i;

const typeOf = (text: string) => (/notul/i.test(text) ? "Notulen" : /proposal/i.test(text) ? "Proposal" : "Laporan");

const escapeXml = (value: string) => value.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Berkas milik tugas laporan yang hasilnya sudah ada; disusun setiap dibaca */
export const reportsOf = (db: MockDatabase, task: MockTask): ReportResult[] => {
  const asked = `${task.title} ${task.brief}`;
  if (!["waiting_approval", "completed"].includes(task.status) || !REPORT.test(asked) || NOT_REPORT.test(asked)) return [];
  const type = typeOf(asked);
  const organization = db.organizations.find((o) => o.id === task.organization_id)?.name ?? "Organisasi";
  const sections: [string, string][] = [
    ["A. Pendahuluan", task.brief || task.title],
    ["B. Uraian", "Uraian kegiatan disusun role (data contoh)."],
    ["C. Penutup", "Demikian disampaikan untuk menjadi bahan pertimbangan."],
  ];
  let y = 180;
  const body = sections
    .map(([heading, text]) => {
      const block = `<text x="70" y="${y}" font-weight="700">${escapeXml(heading)}</text><text x="70" y="${y + 26}">${escapeXml(text.slice(0, 80))}</text>`;
      y += 80;
      return block;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="877" viewBox="0 0 620 877" font-family="serif" font-size="14" fill="#111"><rect width="620" height="877" fill="#fff"/><text x="310" y="70" text-anchor="middle" font-size="13">${escapeXml(organization.toUpperCase())}</text><text x="310" y="110" text-anchor="middle" font-size="18" font-weight="700">${escapeXml(task.title.toUpperCase())}</text>${body}</svg>`;
  const html = `<html><meta charset="utf-8"><body style="font-family:serif"><h2 style="text-align:center">${escapeXml(task.title)}</h2>${sections.map(([h, t]) => `<h3>${escapeXml(h)}</h3><p>${escapeXml(t)}</p>`).join("")}</body></html>`;
  return [
    {
      kind: "report",
      id: `laporan-${task.id}`,
      title: task.title,
      report_type: type,
      version: 1,
      processing: false,
      pages: [`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`],
      docx_url: `data:application/msword;charset=utf-8,${encodeURIComponent(html)}`,
      pdf_url: null,
      checks: [{ text: "Judul dan bagian laporan tersusun", passed: true, ref: "" }],
      composed: [],
      created_at: task.created_at,
      updated_at: task.updated_at,
    },
  ];
};
