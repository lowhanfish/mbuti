"use client";

import React from "react";
import { confirmAlert } from "@/lib/show_swall";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, IconButton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { useCheckFormat, useDeleteCorrection, useResetFormat } from "../hooks/crud";
import { SOURCE_KIND, type LetterFormat } from "../types";

export default function FormatCard({ formats, canEdit }: { formats: LetterFormat[]; canEdit: boolean }) {
  const check = useCheckFormat();
  const reset = useResetFormat();
  const removeCorrection = useDeleteCorrection();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catatan format</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted">Disusun otomatis saat satu jenis naskah pertama kali diminta, lalu dipakai lagi. Tidak perlu disiapkan lebih dulu.</p>
        {formats.length === 0 && <p className="text-sm text-faint">Belum ada. Minta sebuah surat lewat menu Tugas.</p>}
        <ul className="space-y-3">
          {formats.map((f) => (
            <li key={f.id} className="rounded-2xl border border-line bg-surface/70 p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{f.name}</p>
                <Badge size="sm" variant={f.checked ? "success" : "neutral"}>{f.checked ? "Sudah diperiksa" : "Belum diperiksa"}</Badge>
                {f.sources.map((s) => (
                  <Badge key={s.title} size="sm" variant={SOURCE_KIND[s.kind].variant}>{SOURCE_KIND[s.kind].label}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted">
                Kertas {f.paper} · margin atas {f.margins.top}, kanan {f.margins.right}, bawah {f.margins.bottom}, kiri {f.margins.left} cm · {f.font}
              </p>
              <p className="text-xs text-muted">Susunan: {f.sections.join(" → ")}</p>
              <p className="text-[11px] text-faint">Rujukan: {f.sources.map((s) => [s.title, s.detail].filter(Boolean).join(", ")).join("; ")}</p>
              {f.corrections.length > 0 && (
                <ul className="space-y-1">
                  {f.corrections.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 text-ink">“{c.text}” <span className="text-faint">· {c.author_name}</span></span>
                      {canEdit && (
                        <IconButton label="Hapus koreksi" tone="danger" onClick={() => removeCorrection.mutate({ formatId: f.id, id: c.id })}>
                          <Icon name="trash" size={14} />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  {!f.checked && <Button size="sm" onClick={() => check.mutate(f.id)}>Tandai sudah diperiksa</Button>}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (await confirmAlert(`Susun ulang format ${f.name}?`, "Catatan dan koreksinya dihapus, lalu disusun lagi saat surat berikutnya diminta.", "Ya, susun ulang")) reset.mutate(f.id);
                    }}
                  >
                    Susun ulang
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
