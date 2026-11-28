"use client";

import React, { useState } from "react";
import { useUrlStore } from "@/store/useUrlStore";
import { Badge, Button } from "../../../../_components/ui";
import { buttonClasses } from "../../../../_components/ui/button-classes";
import { mediaSrc } from "../../../pengetahuan/types";
import type { SheetResult, SheetRow } from "../../types";

const ROW_CLASS: Record<SheetRow["style"], string> = {
  normal: "",
  flag: "bg-amber-400/15",
  subtotal: "bg-surface-2/60 font-semibold",
  total: "bg-brand-soft/70 font-bold",
};

export default function SheetView({ doc }: { doc: SheetResult }) {
  const [active, setActive] = useState(0);
  const apiBase = useUrlStore((state) => state.URL.APP);
  const sheet = doc.sheets[Math.min(active, doc.sheets.length - 1)];
  const shown = sheet?.rows.filter((r) => r.style === "normal" || r.style === "flag").length ?? 0;
  const failed = doc.checks.filter((c) => !c.passed).length;

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink">{doc.title}</p>
          <p className="text-xs text-muted">
            Spreadsheet · versi {doc.version}
            {doc.source_files.length > 0 && ` · data dari ${doc.source_files.join(", ")}`}
          </p>
        </div>
        {doc.xlsx_url ? (
          <a href={mediaSrc(doc.xlsx_url, apiBase)} download={`${doc.title}.${doc.xlsx_url.startsWith("data:") ? "csv" : "xlsx"}`} className={buttonClasses("primary", "sm")}>
            Unduh Excel
          </a>
        ) : (
          <Button size="sm" disabled>Unduh Excel</Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {doc.origin === "text" && <Badge size="sm" variant="warning">Angka dari teks, periksa dulu</Badge>}
        {sheet && sheet.flagged > 0 && <Badge size="sm" variant="accent">{sheet.flagged} baris ditandai: {sheet.flag_rule}</Badge>}
      </div>
      {doc.processing && !sheet && <p className="text-xs text-muted">Berkas sedang dibuat…</p>}
      {doc.sheets.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lembar">
          {doc.sheets.map((s, i) => (
            <button key={s.name} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)} className={`h-8 px-3 rounded-xl text-xs font-semibold cursor-pointer ${i === active ? "bg-brand text-white" : "bg-surface border border-line text-muted"}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet && (
        <>
          <div className="max-h-96 overflow-auto rounded-2xl border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {sheet.columns.map((c) => (
                    <th key={c.header} scope="col" className={`px-3 py-2 font-semibold text-ink whitespace-nowrap ${c.format === "text" || c.format === "date" ? "text-left" : "text-right"}`}>
                      {c.header}
                      {c.formula && <span className="block text-[10px] font-normal text-faint">{c.formula}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, i) => (
                  <tr key={i} className={`border-t border-line ${ROW_CLASS[row.style]}`}>
                    {row.cells.map((cell, j) => {
                      const format = sheet.columns[j]?.format;
                      return (
                        <td key={j} className={`px-3 py-1.5 text-ink ${format === "text" || format === "date" ? "text-left" : "text-right whitespace-nowrap tabular-nums"}`}>
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheet.row_count > shown && <p className="text-[11px] text-faint">Pratinjau {shown} dari {sheet.row_count} baris; semuanya ada di berkas Excel.</p>}
        </>
      )}
      <details className="text-xs" open={failed > 0}>
        <summary className="cursor-pointer font-semibold text-ink">
          Pemeriksaan: {doc.checks.length - failed} sesuai{failed ? `, ${failed} perlu diperiksa` : ""}
        </summary>
        <ul className="mt-2 space-y-1">
          {doc.checks.map((c) => (
            <li key={c.text} className={c.passed ? "text-muted" : "text-ink font-medium"}>
              <span aria-hidden="true">{c.passed ? "✓" : "!"}</span> {c.text}
              {c.ref && <span className="text-faint"> ({c.ref})</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
