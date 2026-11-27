"use client";

import React, { useRef } from "react";
import { Icon } from "../admin-icons";
import { MAX_IMAGE_BYTES } from "../../admin/pengetahuan/types";
import { useUploadAttachment } from "../../admin/tugas/hooks/crud";
import type { TaskAttachment } from "../../admin/tugas/types";
import { AttachmentStrip } from "./image-findings";

export const MAX_ATTACHMENTS = 10;
const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";

/** Pilih lampiran gambar atau PDF untuk tugas dan uji coba; setiap berkas langsung diunggah. */
export function AttachmentPicker({ value, onChange }: { value: TaskAttachment[]; onChange: (next: TaskAttachment[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAttachment();
  const full = value.length >= MAX_ATTACHMENTS;

  const handle = async (files: FileList | null) => {
    let next = [...value];
    for (const file of Array.from(files ?? []).slice(0, MAX_ATTACHMENTS - value.length)) {
      if (file.size > MAX_IMAGE_BYTES) continue;
      try {
        const res = await upload.mutateAsync(file);
        next = [...next, res.data];
        onChange(next);
      } catch {
        // Pesan galat sudah ditampilkan hook
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted">Lampiran</span>
        <button
          type="button"
          disabled={full || upload.isPending}
          onClick={() => inputRef.current?.click()}
          className="h-8 px-3 rounded-xl text-xs font-semibold bg-surface border border-line text-muted hover:text-brand hover:border-brand/40 inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {upload.isPending ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
          ) : (
            <Icon name="plus" size={13} />
          )}
          Tambah gambar atau PDF
        </button>
        <span className="text-[11px] text-faint">
          {value.length}/{MAX_ATTACHMENTS} · PNG, JPG, WEBP, PDF · maks 10 MB
        </span>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => handle(e.target.files)} />
      </div>
      <AttachmentStrip attachments={value} onRemove={(id) => onChange(value.filter((a) => a.id !== id))} />
      {value.length > 0 && <p className="text-[11px] text-faint">Role membaca gambar ini dan menandai temuannya dengan kotak bernomor.</p>}
    </div>
  );
}
