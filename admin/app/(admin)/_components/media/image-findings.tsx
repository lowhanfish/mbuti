"use client";

import React, { useState } from "react";
import { useUrlStore } from "@/store/useUrlStore";
import { Badge } from "../ui";
import { mediaSrc, type SearchHit } from "../../admin/pengetahuan/types";
import type { Finding, FindingSeverity, TaskAttachment } from "../../admin/tugas/types";

export const SEVERITY_LABEL: Record<FindingSeverity, { label: string; variant: "danger" | "warning" | "info"; color: string }> = {
  penting: { label: "Penting", variant: "danger", color: "#e11d48" },
  perlu_perbaikan: { label: "Perlu perbaikan", variant: "warning", color: "#f59e0b" },
  info: { label: "Info", variant: "info", color: "#7c4dff" },
};

/** Satu gambar yang bisa diberi kotak temuan. */
interface Frame {
  key: string;
  label: string;
  src: string;
}

const frameKey = (f: Finding) => (f.target.kind === "attachment" ? `${f.target.attachment_id}#${f.target.page_no}` : `${f.target.version_id}#${f.target.page_no}`);

/**
 * Gambar dengan kotak bernomor di atasnya dan daftar temuan di sampingnya. Kotak memakai skala 0–1000
 * ([y0, x0, y1, x1]) seperti keluaran Gemini, sehingga tidak bergantung pada ukuran gambar asli.
 */
export function ImageFindings({
  attachments,
  findings,
  citations = [],
}: {
  attachments: TaskAttachment[];
  findings: Finding[];
  citations?: SearchHit[];
}) {
  const apiBase = useUrlStore((state) => state.URL.APP);
  const frames: Frame[] = attachments.flatMap((a) =>
    a.pages.map((page, i) => ({ key: `${a.id}#${i + 1}`, label: a.pages.length > 1 ? `${a.file_name} · hlm. ${i + 1}` : a.file_name, src: mediaSrc(page, apiBase) }))
  );
  const withFindings = frames.filter((fr) => findings.some((f) => frameKey(f) === fr.key));
  const shown = withFindings.length ? withFindings : frames.slice(0, 1);
  const [active, setActive] = useState<string>(shown[0]?.key ?? "");
  const [focus, setFocus] = useState<number | null>(null);

  if (!frames.length) return null;
  const frame = frames.find((f) => f.key === active) ?? shown[0];
  const here = findings.filter((f) => frameKey(f) === frame.key);

  return (
    <div className="space-y-3">
      {shown.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Gambar">
          {shown.map((fr) => (
            <button
              key={fr.key}
              type="button"
              role="tab"
              aria-selected={fr.key === frame.key}
              onClick={() => setActive(fr.key)}
              className={`h-8 px-3 rounded-xl text-[11px] font-semibold whitespace-nowrap border cursor-pointer ${
                fr.key === frame.key ? "bg-ink text-canvas border-ink" : "bg-surface border-line text-muted hover:text-ink"
              }`}
            >
              {fr.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="relative rounded-2xl border border-line bg-white overflow-hidden self-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- gambar lampiran dari API berizin atau data URL */}
          <img src={frame.src} alt={frame.label} className="block w-full h-auto" />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
            {here
              .filter((f) => f.box)
              .map((f) => {
                const [y0, x0, y1, x1] = f.box!;
                const color = SEVERITY_LABEL[f.severity].color;
                const dim = focus !== null && focus !== f.no;
                return (
                  <g key={f.no} opacity={dim ? 0.25 : 1}>
                    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={`${color}1a`} stroke={color} strokeWidth={focus === f.no ? 7 : 4} vectorEffect="non-scaling-stroke" rx={6} />
                  </g>
                );
              })}
          </svg>
          {/* Nomor ditulis di HTML agar tidak ikut melebar bersama skala SVG */}
          {here
            .filter((f) => f.box)
            .map((f) => {
              const [y0, x0] = f.box!;
              return (
                <button
                  key={f.no}
                  type="button"
                  onClick={() => setFocus(focus === f.no ? null : f.no)}
                  aria-label={`Temuan ${f.no}: ${f.title}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-white text-xs font-extrabold shadow-lg ring-2 ring-white cursor-pointer"
                  style={{ top: `${y0 / 10}%`, left: `${Math.max(x0, 30) / 10}%`, background: SEVERITY_LABEL[f.severity].color }}
                >
                  {f.no}
                </button>
              );
            })}
        </div>
        <ol className="space-y-2">
          {here.length ? (
            here.map((f) => {
              const s = SEVERITY_LABEL[f.severity];
              const cite = f.source_index ? citations[f.source_index - 1] : undefined;
              return (
                <li key={f.no}>
                  <button
                    type="button"
                    onClick={() => setFocus(focus === f.no ? null : f.no)}
                    aria-pressed={focus === f.no}
                    className={`w-full text-left rounded-2xl border p-3 space-y-1.5 transition-colors cursor-pointer ${
                      focus === f.no ? "border-brand bg-brand-soft/60" : "border-line bg-surface/80 hover:border-brand/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center shrink-0" style={{ background: s.color }}>
                        {f.no}
                      </span>
                      <span className="text-sm font-bold text-ink flex-1">{f.title}</span>
                      <Badge size="sm" variant={s.variant}>
                        {s.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">{f.description}</p>
                    <p className="text-xs text-ink leading-relaxed">
                      <span className="font-semibold">Rekomendasi:</span> {f.recommendation}
                    </p>
                    {(cite || f.criterion) && (
                      <p className="text-[11px] text-faint">
                        {cite && (
                          <>
                            Pedoman [{f.source_index}]: {cite.document_title}, hlm. {cite.page_no}
                          </>
                        )}
                        {cite && f.criterion && " · "}
                        {f.criterion && <>Kriteria: {f.criterion}</>}
                      </p>
                    )}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="text-xs text-muted">Tidak ada temuan pada gambar ini.</li>
          )}
        </ol>
      </div>
    </div>
  );
}

/** Deretan gambar kecil lampiran. */
export function AttachmentStrip({ attachments, onRemove }: { attachments: TaskAttachment[]; onRemove?: (id: string) => void }) {
  const apiBase = useUrlStore((state) => state.URL.APP);
  if (!attachments.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {attachments.map((a) => (
        <li key={a.id} className="relative w-24 rounded-xl border border-line bg-surface overflow-hidden">
          {a.table ? (
            <div className="w-24 h-24 flex flex-col items-center justify-center gap-1 bg-emerald-500/15 text-emerald-700" title={a.table.map((t) => `${t.name}: ${t.columns.join(", ")}`).join(" · ")}>
              <span className="text-xs font-extrabold">{a.file_name.toLowerCase().endsWith(".csv") ? "CSV" : "XLSX"}</span>
              <span className="text-[10px]">{a.table.reduce((s, t) => s + t.row_count, 0)} baris</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- gambar lampiran dari API berizin atau data URL
            <img src={mediaSrc(a.pages[0], apiBase)} alt={a.file_name} className="w-24 h-24 object-cover bg-white" />
          )}
          <p className="px-1.5 py-1 text-[10px] text-muted truncate" title={a.file_name}>
            {a.mime_type === "application/pdf" ? `PDF · ${a.page_count} hlm.` : a.file_name}
          </p>
          {onRemove && (
            <button
              type="button"
              aria-label={`Hapus lampiran ${a.file_name}`}
              onClick={() => onRemove(a.id)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-night/70 text-white text-xs flex items-center justify-center cursor-pointer"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
