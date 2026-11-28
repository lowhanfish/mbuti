"use client";

import Link from "next/link";
import React, { useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Modal } from "../../../../_components/ui";
import { buttonClasses } from "../../../../_components/ui/button-classes";
import { mediaSrc } from "../../../pengetahuan/types";
import { SOURCE_KIND } from "../../../pengaturan/persuratan/types";
import { useCorrectDocument, useNumberDocument, useResponseDocuments } from "../../hooks/documents";
import type { ResultDocument, TaskStatus } from "../../types";

function DocumentView({ taskId, doc }: { taskId: string; doc: ResultDocument }) {
  const [text, setText] = useState("");
  const [page, setPage] = useState<string | null>(null);
  const apiBase = useUrlStore((state) => state.URL.APP);
  const correct = useCorrectDocument(taskId);
  const assign = useNumberDocument(taskId);
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
            {doc.letter_type} · versi {doc.version} · Nomor: {doc.number ?? (doc.can_number ? "belum diberikan" : "diberikan saat disetujui")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!doc.official && <Badge size="sm" variant="warning">Belum sesuai aturan resmi</Badge>}
          <Badge size="sm" variant={doc.format_checked ? "success" : "neutral"}>{doc.format_checked ? "Format sudah diperiksa" : "Format belum diperiksa"}</Badge>
        </div>
        <ul className="space-y-1.5">
          {doc.sources.map((s) => (
            <li key={s.title + s.detail} className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge size="sm" variant={SOURCE_KIND[s.kind].variant}>{SOURCE_KIND[s.kind].label}</Badge>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline break-all">{s.title}</a>
              ) : (
                <span className="text-ink">{s.title}</span>
              )}
              {s.detail && <span className="text-faint">{s.detail}</span>}
            </li>
          ))}
        </ul>
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
          {doc.can_number && (
            <Button
              size="sm"
              variant="accent"
              loading={assign.isPending}
              onClick={async () => {
                if (await confirmAlert("Beri nomor surat ini?", "Surat yang sudah bernomor tidak bisa diubah lagi.", "Ya, beri nomor")) assign.mutate(doc.id);
              }}
            >
              Beri nomor
            </Button>
          )}
          <Link href="/admin/pengaturan/persuratan" className="self-center text-xs font-semibold text-brand hover:underline">Catatan format</Link>
        </div>
        {doc.number ? (
          <p className="text-xs text-faint">Surat sudah bernomor dan tidak bisa diubah.</p>
        ) : (
          <form
            className="flex flex-col sm:flex-row gap-2 sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              correct.mutate({ id: doc.id, text: text.trim() }, { onSuccess: () => setText("") });
            }}
          >
            <div className="flex-1">
              <Input label="Perbaiki format" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="mis. tembusan taruh di kiri bawah" />
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={text.trim().length < 5} loading={correct.isPending}>Perbaiki</Button>
          </form>
        )}
      </div>
      <Modal isOpen={Boolean(page)} onClose={() => setPage(null)} title={doc.title} maxWidth="lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {page && <img src={page} alt={doc.title} className="w-full h-auto rounded-xl border border-line bg-white" />}
      </Modal>
    </div>
  );
}

export default function ResultDocuments({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const { Documents } = useResponseDocuments(taskId, status);
  if (!Documents.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Berkas hasil</CardTitle>
        <span className="text-[11px] text-faint">{Documents.length} berkas</span>
      </CardHeader>
      <CardContent className="space-y-6">
        {Documents.map((doc) => (
          <DocumentView key={doc.id} taskId={taskId} doc={doc} />
        ))}
      </CardContent>
    </Card>
  );
}
