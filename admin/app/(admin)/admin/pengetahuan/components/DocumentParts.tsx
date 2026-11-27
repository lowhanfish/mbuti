"use client";

import React, { useRef, useState } from "react";
import { Badge } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { ACCEPT_ATTR, MAX_FILE_BYTES, MAX_IMAGE_BYTES, STATUS_LABEL, formatBytes, type DocumentVersion } from "../types";

/** Ikon berkas berwarna sesuai jenisnya. */
export function FileGlyph({ fileName, size = 44 }: { fileName: string; size?: number }) {
  const ext = (fileName.split(".").pop() ?? "").toUpperCase();
  const tone =
    ext === "PDF"
      ? "from-rose-400 to-red-600"
      : ext === "DOCX"
        ? "from-sky-400 to-blue-600"
        : ext === "MD"
          ? "from-[#9b6bff] to-brand-strong"
          : "from-slate-400 to-slate-600";
  return (
    <span
      className={`relative rounded-xl bg-gradient-to-br ${tone} text-white font-extrabold flex items-end justify-center pb-1.5 shrink-0 shadow-md`}
      style={{ width: size * 0.82, height: size, fontSize: size * 0.22 }}
      aria-hidden="true"
    >
      <span className="absolute top-0 right-0 w-[32%] h-[24%] bg-white/35 rounded-bl-lg" />
      {ext.slice(0, 4) || "DOC"}
    </span>
  );
}

/** Status olah dokumen; saat diolah tampil sebagai bilah progres beranimasi. */
export function IngestionStatusView({ version }: { version: DocumentVersion | null }) {
  if (!version) return <Badge size="sm">Tanpa berkas</Badge>;
  if (version.status === "processing" || version.status === "queued") {
    const pct = version.status === "queued" ? 4 : Math.max(6, version.progress);
    return (
      <div className="w-36 space-y-1" role="status" aria-label={`${STATUS_LABEL[version.status]} ${pct}%`}>
        <div className="flex justify-between text-[10px] font-semibold text-brand">
          <span>{STATUS_LABEL[version.status]}…</span>
          {version.status === "processing" && <span>{version.progress}%</span>}
        </div>
        <div className="h-1.5 rounded-full bg-brand-soft overflow-hidden">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#7c4dff,#ffb81c,#7c4dff)] bg-[length:200%_100%] animate-shimmer transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }
  if (version.status === "failed") {
    return (
      <span title={version.error_message ?? undefined}>
        <Badge variant="danger" size="sm" dot>
          Gagal diolah
        </Badge>
      </span>
    );
  }
  return (
    <Badge variant="success" size="sm" dot>
      Siap · {version.page_count} hlm.
    </Badge>
  );
}

/** Area seret-lepas berkas. Validasi jenis dan ukuran dilakukan di sini dan diulang di server. */
export function FileDropzone({
  file,
  onFile,
  label = "Seret berkas ke sini atau klik untuk memilih",
}: {
  file: File | null;
  onFile: (file: File | null, error: string | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(pdf|docx|txt|md|png|jpe?g|webp)$/i.test(f.name)) return onFile(null, "Gunakan PDF, DOCX, TXT, MD, atau gambar PNG, JPG, WEBP.");
    if (/\.(png|jpe?g|webp)$/i.test(f.name) && f.size > MAX_IMAGE_BYTES) return onFile(null, "Ukuran gambar melebihi 10 MB.");
    if (f.size > MAX_FILE_BYTES) return onFile(null, "Ukuran berkas melebihi 20 MB.");
    onFile(f, null);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files[0]);
      }}
      className={`relative rounded-3xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
        dragging ? "border-brand bg-brand-soft scale-[1.01]" : file ? "border-emerald-300 bg-emerald-50/60" : "border-line bg-surface/70 hover:border-brand/50 hover:bg-brand-soft/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex items-center gap-3 text-left">
          <FileGlyph fileName={file.name} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink truncate">{file.name}</p>
            <p className="text-xs text-muted">{formatBytes(file.size)} · klik untuk mengganti</p>
          </div>
          <Icon name="check" size={20} className="text-emerald-600" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-[#9b6bff] text-white flex items-center justify-center shadow-lg">
            <Icon name="plus" size={22} />
          </span>
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-muted">PDF, DOCX, TXT, MD (maks 20 MB) atau gambar PNG, JPG, WEBP (maks 10 MB)</p>
          <p className="text-[11px] text-faint">Halaman bergambar dan hasil scan dibaca Gemini multimodal.</p>
        </div>
      )}
    </div>
  );
}

/** Tandai kata yang dicari di dalam teks halaman. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-accent-soft text-ink rounded px-0.5 ring-1 ring-accent/40">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
