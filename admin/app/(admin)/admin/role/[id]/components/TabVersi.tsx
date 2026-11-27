"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { REVISION_SOURCE_LABEL, REVISION_STATUS_LABEL, type RevisionSnapshot } from "../../formation-types";
import { useFormation, useRestoreVersion, useVersionDetail, useVersions } from "../../hooks/formation";
import { KNOWLEDGE_SCOPE_LABEL, MODEL_PROFILE_LABEL, OUTPUT_FORMAT_LABEL, type ResponseInterface } from "../../types";

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Isian kerja dalam bentuk baris teks agar mudah dibandingkan. */
const fields = (s: RevisionSnapshot): Array<[string, string]> => [
  ["Tujuan kerja", s.goal],
  ["Instruksi", s.instructions],
  ["Isian tugas", s.input_spec.map((f) => `${f.label}${f.required ? " (wajib)" : ""}`).join(", ")],
  ["Format hasil", OUTPUT_FORMAT_LABEL[s.output_format]],
  ["Templat", s.output_template],
  ["Kriteria diterima", s.acceptance_criteria.join("; ")],
  ["Lingkup pengetahuan", KNOWLEDGE_SCOPE_LABEL[s.knowledge_scope].label],
  ["Model", MODEL_PROFILE_LABEL[s.model_profile].label],
  ["Pencarian internet", s.web_search ? "Boleh" : "Mati"],
];

function Compare({ roleId, leftId, rightId }: { roleId: string; leftId: string; rightId: string }) {
  const { Version: left } = useVersionDetail(roleId, leftId);
  const { Version: right } = useVersionDetail(roleId, rightId);
  if (!left || !right) return <Skeleton className="h-64 rounded-3xl" />;
  const a = fields(left.snapshot);
  const b = fields(right.snapshot);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Versi {left.version_no} dibanding versi {right.version_no}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {a.map(([label, value], i) => {
          const other = b[i][1];
          const same = value === other;
          return (
            <div key={label} className="grid gap-2 sm:grid-cols-[150px_1fr_1fr] text-xs">
              <p className="font-semibold text-muted pt-2">
                {label}
                {!same && (
                  <Badge size="sm" variant="accent" className="ml-1.5">
                    Beda
                  </Badge>
                )}
              </p>
              {[value, other].map((v, j) => (
                <pre
                  key={j}
                  className={`whitespace-pre-wrap font-sans leading-relaxed rounded-xl border p-2.5 max-h-48 overflow-y-auto ${
                    same ? "border-line bg-canvas/50 text-muted" : j === 0 ? "border-rose-200 bg-rose-50/60 text-ink dark:bg-rose-500/10" : "border-emerald-200 bg-emerald-50/60 text-ink dark:bg-emerald-500/10"
                  }`}
                >
                  {v || "—"}
                </pre>
              ))}
            </div>
          );
        })}
        <p className="text-[11px] text-faint">
          Kartu keterampilan: {left.card?.skills.length ?? 0} → {right.card?.skills.length ?? 0} keterampilan.
        </p>
      </CardContent>
    </Card>
  );
}

export default function TabVersi({ role }: { role: ResponseInterface }) {
  const router = useRouter();
  const { Versions, isLoading } = useVersions(role.id);
  const { Formation } = useFormation(role.id);
  const restore = useRestoreVersion(role.id);
  const [selected, setSelected] = useState<string[]>([]);

  if (isLoading) return <Skeleton className="h-72 rounded-3xl" />;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));

  const handleRestore = async (id: string, no: number) => {
    const ok = await confirmAlert(
      `Pulihkan versi ${no}?`,
      `Isian versi ${no} disalin ke revisi baru. Revisi itu perlu Final sebelum dipakai; versi sekarang tetap bekerja sampai saat itu.`,
      "Ya, buat revisi"
    );
    if (ok) restore.mutate(id, { onSuccess: () => router.push(`/admin/role/${role.id}/bentuk`) });
  };

  const ordered = [...selected].sort((x, y) => (Versions.find((v) => v.id === x)?.version_no ?? 0) - (Versions.find((v) => v.id === y)?.version_no ?? 0));
  const hasOpen = Versions.some((v) => ["draft", "analyzing", "questioning", "ready"].includes(v.status));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Riwayat versi</CardTitle>
          <span className="text-[11px] text-faint">Pilih dua versi untuk dibandingkan</span>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-line/70">
            {Versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
                <input
                  type="checkbox"
                  aria-label={`Bandingkan versi ${v.version_no}`}
                  checked={selected.includes(v.id)}
                  onChange={() => toggle(v.id)}
                  className="w-4 h-4 accent-[#7c4dff] cursor-pointer"
                />
                <span className="w-10 h-10 rounded-2xl bg-brand-soft text-brand-strong font-extrabold flex items-center justify-center">v{v.version_no}</span>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge size="sm" variant={v.is_active ? "success" : v.status === "final" || v.status === "superseded" ? "neutral" : "info"} dot>
                      {v.is_active ? "Dipakai bekerja" : REVISION_STATUS_LABEL[v.status]}
                    </Badge>
                    <Badge size="sm" variant="neutral">
                      {REVISION_SOURCE_LABEL[v.source]}
                    </Badge>
                    {v.skill_count > 0 && <span className="text-[11px] text-faint">{v.skill_count} keterampilan</span>}
                    {v.question_count > 0 && <span className="text-[11px] text-faint">· {v.question_count} pertanyaan</span>}
                  </div>
                  <p className="text-xs text-ink mt-1">{v.change_note || "—"}</p>
                  <p className="text-[11px] text-faint">
                    {v.finalized_at ? `Final ${date(v.finalized_at)} oleh ${v.finalized_by_name ?? "—"}` : "Belum Final"}
                  </p>
                </div>
                {Formation?.can_edit && !v.is_active && (v.status === "superseded" || v.status === "final") && (
                  <Button variant="outline" size="sm" disabled={hasOpen} loading={restore.isPending} onClick={() => handleRestore(v.id, v.version_no)}>
                    Pulihkan
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {hasOpen && <p className="px-6 pb-4 text-[11px] text-faint">Pulihkan tersedia setelah revisi yang sedang disusun Final atau dibuang.</p>}
        </CardContent>
      </Card>
      {ordered.length === 2 ? (
        <Compare roleId={role.id} leftId={ordered[0]} rightId={ordered[1]} />
      ) : (
        <p className="text-xs text-muted flex items-center gap-1.5">
          <Icon name="list" size={14} />
          Centang dua versi untuk melihat perbedaannya.
        </p>
      )}
    </div>
  );
}
