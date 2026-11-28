"use client";

import Link from "next/link";
import React, { useState } from "react";
import { formatDate } from "@/utilities/labels";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../../../../_components/ui";
import { useSaveRegister } from "../hooks/crud";
import type { NumberRegister } from "../types";

function Register({ register, canEdit }: { register: NumberRegister; canEdit: boolean }) {
  const [pattern, setPattern] = useState(register.pattern);
  const [next, setNext] = useState(String(register.next_number));
  const save = useSaveRegister();
  const dirty = pattern !== register.pattern || Number(next) !== register.next_number;

  return (
    <li className="rounded-2xl border border-line bg-surface/70 p-4 space-y-2">
      <p className="font-semibold text-ink">{register.name}</p>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_120px_auto] items-end"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ id: register.id, body: { pattern: pattern.trim(), next_number: Number(next) } });
        }}
      >
        <Input label="Pola nomor" maxLength={80} value={pattern} disabled={!canEdit} onChange={(e) => setPattern(e.target.value)} />
        <Input label="Urut berikutnya" type="number" min={1} value={next} disabled={!canEdit} onChange={(e) => setNext(e.target.value)} />
        {canEdit && <Button type="submit" size="sm" disabled={!dirty || !pattern.includes("[urut]") || !(Number(next) >= 1)} loading={save.isPending}>Simpan</Button>}
      </form>
      <p className="text-[11px] text-faint">Nomor berikutnya: {register.preview}</p>
      {register.issued.length > 0 && (
        <ul className="space-y-1 text-xs">
          {register.issued.map((n) => (
            <li key={n.number} className="flex flex-wrap gap-x-2">
              <span className="font-mono text-ink">{n.number}</span>
              {n.task_id ? (
                <Link href={`/admin/tugas/${n.task_id}`} className="text-brand hover:underline">{n.title}</Link>
              ) : (
                <span className="text-muted">{n.title}</span>
              )}
              <span className="text-faint">{formatDate(n.issued_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function RegisterCard({ registers, canEdit }: { registers: NumberRegister[]; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Buku register nomor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted">Nomor diberikan saat surat disetujui. Pola boleh memuat [urut] (wajib), [bulan] angka Romawi, dan [tahun].</p>
        {registers.length === 0 && <p className="text-sm text-faint">Register muncul saat jenis naskahnya pertama kali dibuat.</p>}
        <ul className="space-y-3">
          {registers.map((r) => (
            <Register key={`${r.id}-${r.pattern}-${r.next_number}`} register={r} canEdit={canEdit} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
