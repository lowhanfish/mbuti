"use client";

import React, { useRef } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import { formatDate } from "@/utilities/labels";
import { Button, Card, CardContent, CardHeader, CardTitle, IconButton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { mediaSrc } from "../../../pengetahuan/types";
import { useDeleteLetterhead, useDeleteSample, useUploadLetterhead, useUploadSample } from "../hooks/crud";
import type { Letterhead, LetterSample } from "../types";

function Picker({ label, accept, loading, onFile }: { label: string; accept: string; loading: boolean; onFile: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="outline" loading={loading} onClick={() => ref.current?.click()}>{label}</Button>
    </>
  );
}

export function LetterheadCard({ letterheads, canEdit }: { letterheads: Letterhead[]; canEdit: boolean }) {
  const add = useUploadLetterhead();
  const remove = useDeleteLetterhead();
  const apiBase = useUrlStore((state) => state.URL.APP);
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Kop surat</CardTitle>
        {canEdit && <Picker label="Unggah gambar kop" accept="image/png,image/jpeg" loading={add.isPending} onFile={(f) => add.mutate(f)} />}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted">Cukup sekali. Bila kosong, kop diambil dari contoh Word atau ditulis sebagai teks. Gambar PNG atau JPG, paling besar 2 MB.</p>
        {letterheads.length === 0 && <p className="text-sm text-faint">Belum ada gambar kop.</p>}
        {letterheads.map((k) => (
          <div key={k.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaSrc(k.image_url, apiBase)} alt={`Kop ${k.unit_name ?? "organisasi"}`} className="flex-1 min-w-0 max-h-24 object-contain" />
            <span className="text-xs text-slate-600">{k.unit_name ?? "Organisasi"}</span>
            {canEdit && (
              <IconButton label="Hapus kop" tone="danger" onClick={async () => (await confirmAlert("Hapus kop ini?", "Surat berikutnya tidak memakainya lagi.", "Ya, hapus")) && remove.mutate(k.id)}>
                <Icon name="trash" size={16} />
              </IconButton>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SampleCard({ samples, canEdit }: { samples: LetterSample[]; canEdit: boolean }) {
  const add = useUploadSample();
  const remove = useDeleteSample();
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Contoh surat Word</CardTitle>
        {canEdit && <Picker label="Unggah DOCX" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" loading={add.isPending} onFile={(f) => add.mutate(f)} />}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted">
          Tidak wajib. Kop, huruf, margin, dan gayanya ditiru. Aturan persuratan (PDF atau Word) diunggah di menu Pengetahuan, pustaka kebijakan.
        </p>
        {samples.length === 0 && <p className="text-sm text-faint">Belum ada contoh.</p>}
        {samples.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/70 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{s.file_name}</p>
              <p className="text-[11px] text-faint">{Math.ceil(s.size_bytes / 1024)} KB · {s.uploaded_by_name ?? "—"} · {formatDate(s.created_at)}</p>
            </div>
            {canEdit && (
              <IconButton label={`Hapus ${s.file_name}`} tone="danger" onClick={async () => (await confirmAlert(`Hapus ${s.file_name}?`, "Catatan format yang sudah ada tetap dipakai.", "Ya, hapus")) && remove.mutate(s.id)}>
                <Icon name="trash" size={16} />
              </IconButton>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
