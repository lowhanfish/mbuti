"use client";

import Link from "next/link";
import React, { useState } from "react";
import { isMockMode } from "@/lib/transport";
import { formatDate } from "@/utilities/labels";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "../../../../_components/ui";
import { FileDropzone, IngestionStatusView } from "../../components/DocumentParts";
import { useActivateVersion, useDownloadVersion, useUploadVersion } from "../../hooks/crud";
import { formatBytes, type DetailInterface } from "../../types";

export default function VersionPanel({ doc, canEdit }: { doc: DetailInterface; canEdit: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState(0);
  const upload = useUploadVersion(doc.id);
  const activate = useActivateVersion(doc.id);
  const download = useDownloadVersion(doc.id);
  const activeNo = doc.active_version?.version_no ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Versi</CardTitle>
        <Badge size="sm">{doc.versions.length} versi</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="relative space-y-3 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
          {doc.versions.map((v) => (
            <li key={v.id} className="relative flex gap-3">
              <span
                className={`relative z-10 w-8 h-8 rounded-xl text-[11px] font-extrabold flex items-center justify-center shrink-0 ${
                  v.is_active ? "bg-gradient-to-br from-brand to-[#9b6bff] text-white shadow-md" : "bg-white border border-line text-muted"
                }`}
              >
                v{v.version_no}
              </span>
              <div className="flex-1 min-w-0 rounded-2xl bg-white/80 border border-line p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink truncate" title={v.file_name}>
                    {v.file_name}
                  </p>
                  {v.is_active && (
                    <Badge size="sm" variant="dark">
                      Aktif
                    </Badge>
                  )}
                  {v.version_no > activeNo && (v.status === "queued" || v.status === "processing") && (
                    <Badge size="sm" variant="accent">
                      Aktif setelah siap
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-faint">
                  {formatBytes(v.size_bytes)} · {formatDate(v.created_at)}
                  {v.uploaded_by_name ? ` · ${v.uploaded_by_name}` : ""}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <IngestionStatusView version={v} />
                  {canEdit && !v.is_active && v.status === "ready" && (
                    <Button size="sm" variant="ghost" loading={activate.isPending} onClick={() => activate.mutate(v.id)}>
                      Jadikan aktif
                    </Button>
                  )}
                </div>
                {v.status === "failed" && v.error_message && <p className="text-[11px] text-rose-600">{v.error_message}</p>}
                <div className="flex items-center gap-3 text-[11px] font-semibold">
                  {!v.is_active && v.status === "ready" && (
                    <Link href={`/admin/pengetahuan/${doc.id}?versi=${v.id}`} className="text-brand hover:underline">
                      Lihat isi
                    </Link>
                  )}
                  {isMockMode() ? (
                    <span className="text-faint" title="Berkas asli baru tersimpan setelah ada backend">
                      Unduh (butuh backend)
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => download.mutate(v)}
                      disabled={download.isPending}
                      className="font-semibold text-brand hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                    >
                      {download.isPending && download.variables?.id === v.id ? "Mengunduh…" : "Unduh berkas"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {canEdit && (
          <div className="pt-2 space-y-2">
            <FileDropzone
              key={dropKey}
              file={file}
              label="Unggah versi baru"
              onFile={(f, err) => {
                setFile(f);
                setError(err);
              }}
            />
            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
            {file && (
              <Button
                className="w-full"
                loading={upload.isPending}
                onClick={() => {
                  const form = new FormData();
                  form.append("file", file);
                  upload.mutate(form, {
                    onSuccess: () => {
                      setFile(null);
                      setDropKey((k) => k + 1);
                    },
                  });
                }}
              >
                Unggah sebagai v{Math.max(...doc.versions.map((v) => v.version_no), 0) + 1}
              </Button>
            )}
            <p className="text-[11px] text-muted">Versi baru menjadi aktif setelah selesai diolah; sampai saat itu role memakai versi lama. Versi lama tetap tersimpan dan bisa diaktifkan kembali.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
