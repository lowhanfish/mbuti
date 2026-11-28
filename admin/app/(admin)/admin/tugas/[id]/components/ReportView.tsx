"use client";

import React, { useState } from "react";
import { useUrlStore } from "@/store/useUrlStore";
import { Button, Modal } from "../../../../_components/ui";
import { buttonClasses } from "../../../../_components/ui/button-classes";
import { mediaSrc } from "../../../pengetahuan/types";
import type { ReportResult } from "../../types";

/** Laporan, notulen, atau proposal (E3c): pratinjau halaman, pemeriksaan, dan unduhan. */
export default function ReportView({ doc }: { doc: ReportResult }) {
  const [page, setPage] = useState<string | null>(null);
  const apiBase = useUrlStore((state) => state.URL.APP);
  const failed = doc.checks.filter((c) => !c.passed).length;

  return (
    <div className="grid gap-4 md:grid-cols-[200px_1fr] items-start">
      <div className="flex md:flex-col gap-2 overflow-x-auto">
        {doc.processing && doc.pages.length === 0 && <p className="text-xs text-muted">Berkas sedang dibuat…</p>}
        {doc.pages.map((p) => mediaSrc(p, apiBase)).map((src, i) => (
          <button key={src.slice(-40) + i} type="button" onClick={() => setPage(src)} className="shrink-0 w-40 md:w-full rounded-xl border border-line overflow-hidden bg-white cursor-zoom-in" aria-label={`Perbesar halaman ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Halaman ${i + 1} ${doc.title}`} className="w-full h-auto" />
          </button>
        ))}
      </div>
      <div className="space-y-3 min-w-0">
        <div>
          <p className="font-semibold text-ink">{doc.title}</p>
          <p className="text-xs text-muted">
            {doc.report_type} · versi {doc.version}
          </p>
        </div>
        <details className="text-xs" open={failed > 0}>
          <summary className="cursor-pointer font-semibold text-ink">
            Pemeriksaan: {doc.checks.length - failed} sesuai{failed ? `, ${failed} perlu diperiksa` : ""}
          </summary>
          <ul className="mt-2 space-y-1">
            {doc.checks.map((c) => (
              <li key={c.text} className={c.passed ? "text-muted" : "text-ink font-medium"}>
                <span aria-hidden="true">{c.passed ? "✓" : "!"}</span> {c.text}
              </li>
            ))}
          </ul>
        </details>
        <div className="flex flex-wrap gap-2">
          {doc.docx_url ? (
            <a href={mediaSrc(doc.docx_url, apiBase)} download={`${doc.title}.${doc.docx_url.startsWith("data:") ? "doc" : "docx"}`} className={buttonClasses("primary", "sm")}>Unduh DOCX</a>
          ) : (
            <Button size="sm" disabled>Unduh DOCX</Button>
          )}
          {doc.pdf_url ? (
            <a href={mediaSrc(doc.pdf_url, apiBase)} download={`${doc.title}.pdf`} className={buttonClasses("outline", "sm")}>Unduh PDF</a>
          ) : (
            <Button size="sm" variant="outline" disabled title="PDF dibuat oleh server">Unduh PDF</Button>
          )}
        </div>
      </div>
      <Modal isOpen={Boolean(page)} onClose={() => setPage(null)} title={doc.title} maxWidth="lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {page && <img src={page} alt={doc.title} className="w-full h-auto rounded-xl border border-line bg-white" />}
      </Modal>
    </div>
  );
}
