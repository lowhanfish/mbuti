"use client";

import React, { useState } from "react";
import { Card, EmptyState } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { Highlight } from "../../components/DocumentParts";
import { useUrlStore } from "@/store/useUrlStore";
import { citationText, mediaSrc, type DocumentSection, type DocumentVersion } from "../../types";

export default function PageReader({
  title,
  version,
  sections,
  initialPage,
  query,
}: {
  title: string;
  version: DocumentVersion | null;
  sections: DocumentSection[];
  initialPage: number;
  query: string;
}) {
  const [page, setPage] = useState(initialPage);
  const [copied, setCopied] = useState(false);
  const apiBase = useUrlStore((state) => state.URL.APP);
  const current = sections.find((s) => s.page_no === page) ?? sections[0];
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);

  if (!version || version.status !== "ready" || !current) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="book" size={26} />}
          title={version?.status === "failed" ? "Versi ini gagal diolah" : "Halaman belum bisa dibaca"}
          description={
            version?.status === "failed"
              ? version.error_message ?? "Unggah ulang berkas yang berisi teks."
              : version?.status === "ready"
                ? "Tidak ada isi yang tersimpan untuk versi ini."
                : "Dokumen masih diolah. Halaman tampil otomatis setelah selesai."
          }
        />
      </Card>
    );
  }

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citationText(title, version.version_no, current.page_no));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className="grid md:grid-cols-[200px_1fr]">
      <nav className="border-b md:border-b-0 md:border-r border-line/70 p-3 max-h-[520px] overflow-y-auto" aria-label="Halaman dokumen">
        <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{sections.length} halaman</p>
        <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {sections.map((s) => {
            const hasHit = terms.some((t) => `${s.heading} ${s.text}`.toLowerCase().includes(t));
            return (
              <li key={s.page_no} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setPage(s.page_no)}
                  aria-current={s.page_no === current.page_no ? "page" : undefined}
                  className={`w-full text-left rounded-xl px-2.5 py-2 text-xs transition-all cursor-pointer ${
                    s.page_no === current.page_no ? "bg-ink text-canvas" : "text-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold">
                    Hlm. {s.page_no}
                    {s.image_url && <span className="text-[9px] font-bold rounded bg-emerald-500/15 text-emerald-700 px-1">Gambar</span>}
                    {hasHit && <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Ada kata yang dicari" />}
                  </span>
                  <span className="hidden md:block truncate opacity-80">{s.heading}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <article key={current.page_no} className="p-5 sm:p-7 rise">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[11px] font-semibold text-brand">Halaman {current.page_no}</p>
            <h3 className="text-lg font-bold text-ink">{current.heading}</h3>
          </div>
          <button
            type="button"
            onClick={copyCitation}
            className="h-8 px-3 rounded-xl text-xs font-semibold bg-surface border border-line text-muted hover:text-brand hover:border-brand/40 transition-colors cursor-pointer"
          >
            {copied ? "Tersalin ✓" : "Salin rujukan"}
          </button>
        </div>
        {current.image_url && (
          <figure className="mb-4 space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- gambar dari API berizin atau data URL, bukan aset statis */}
            <img
              src={mediaSrc(current.image_url, apiBase)}
              alt={`Gambar ${title} halaman ${current.page_no}`}
              className="w-full max-h-[560px] object-contain rounded-2xl border border-line bg-white"
            />
            <figcaption className="text-[11px] text-faint">
              {current.render === "scan" ? "Hasil scan" : "Halaman bergambar"}: dicari lewat kemiripan gambar dan dibaca Gemini multimodal saat dipakai tugas.
            </figcaption>
          </figure>
        )}
        <div className="rounded-2xl bg-surface border border-line p-5 text-sm text-ink leading-7 whitespace-pre-wrap shadow-inner">
          <Highlight text={current.visual_text || current.text} terms={terms} />
        </div>
        <p className="text-[11px] text-faint mt-3">Rujukan: {citationText(title, version.version_no, current.page_no)}</p>
      </article>
    </Card>
  );
}
