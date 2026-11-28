"use client";

import React, { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from "../../../../../_components/ui";
import { Icon } from "../../../../../_components/admin-icons";
import { confirmAlert } from "@/lib/show_swall";
import type { FormationInterface, RevisionSnapshot } from "../../../formation-types";
import { COMPOSE_MODE_LABEL, INPUT_TYPE_LABEL, KNOWLEDGE_SCOPE_LABEL, MODEL_PROFILE_LABEL, OUTPUT_FORMAT_LABEL } from "../../../types";
import { useDiscardRevision, useFinalize } from "../../../hooks/formation";

export function SnapshotView({ snapshot }: { snapshot: RevisionSnapshot }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Tujuan kerja", snapshot.goal || "—"],
    ["Format hasil", OUTPUT_FORMAT_LABEL[snapshot.output_format]],
    ["Lingkup pengetahuan", KNOWLEDGE_SCOPE_LABEL[snapshot.knowledge_scope].label],
    ["Model", MODEL_PROFILE_LABEL[snapshot.model_profile].label],
    ["Pencarian internet", snapshot.web_search ? "Boleh" : "Mati"],
    ["Mode penyusunan", COMPOSE_MODE_LABEL[snapshot.compose_mode ?? "data"].label],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[160px_1fr] text-sm">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-xs font-semibold text-muted pt-0.5">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted">Instruksi</p>
        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink rounded-2xl bg-canvas/70 border border-line p-3 max-h-72 overflow-y-auto">
          {snapshot.instructions || "—"}
        </pre>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted">Isian saat diberi tugas</p>
          {snapshot.input_spec.length ? (
            <ul className="space-y-1">
              {snapshot.input_spec.map((f) => (
                <li key={f.key} className="text-xs text-ink flex items-center gap-1.5">
                  <span className="font-semibold">{f.label}</span>
                  <span className="text-faint">· {INPUT_TYPE_LABEL[f.type]}</span>
                  {f.required && (
                    <Badge size="sm" variant="warning">
                      Wajib
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-faint">Tidak ada.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted">Kriteria hasil diterima</p>
          <ul className="space-y-1 list-disc pl-4">
            {snapshot.acceptance_criteria.map((c) => (
              <li key={c} className="text-xs text-ink">
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function StepFinal({
  agentId,
  agentName,
  formation,
  canEdit,
  hasActiveVersion,
  onDone,
}: {
  agentId: string;
  agentName: string;
  formation: FormationInterface;
  canEdit: boolean;
  hasActiveVersion: boolean;
  onDone: () => void;
}) {
  const [note, setNote] = useState(formation.source === "restore" ? `Dipulihkan dari versi sebelumnya` : "");
  const [reason, setReason] = useState("");
  const [statusAfter, setStatusAfter] = useState<"active" | "paused">("active");
  const finalize = useFinalize(agentId);
  const discard = useDiscardRevision(agentId);

  if (!formation.snapshot) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted">Isian kerja disusun setelah analisis selesai.</CardContent>
      </Card>
    );
  }

  const open = formation.open_required;
  const blocked = open > 0 && reason.trim().length < 5;

  const handleDiscard = async () => {
    const ok = await confirmAlert(
      "Buang revisi ini?",
      `Kartu dan tanya jawab revisi ini dibuang. ${agentName} tetap bekerja dengan versi Final yang sekarang.`,
      "Ya, buang"
    );
    if (ok) discard.mutate({}, { onSuccess: onDone });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Isian kerja versi {formation.version_no}</CardTitle>
          <Badge size="sm" variant="info">
            Pratinjau
          </Badge>
        </CardHeader>
        <CardContent>
          <SnapshotView snapshot={formation.snapshot} />
          <p className="text-[11px] text-faint mt-4">Isian ini disusun dari kartu dan tanya jawab. Ubah kartu bila ada yang kurang tepat.</p>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="space-y-5">
          <Card glow>
            <CardContent className="space-y-4">
              {open > 0 ? (
                <div className="rounded-2xl bg-accent-soft p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-900">Masih ada {open} pertanyaan wajib yang belum dijawab.</p>
                  <Textarea
                    label="Alasan tetap Final"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="mis. Akan dilengkapi setelah rapat minggu depan"
                    maxLength={500}
                  />
                </div>
              ) : (
                <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                  <Icon name="check" size={14} />
                  Semua pertanyaan wajib sudah dijawab.
                </p>
              )}
              <Input label="Catatan perubahan" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Menambah keterampilan infografis" maxLength={500} />
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted">Status sesudah Final</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["active", "Aktif", "Langsung menerima tugas"],
                      ["paused", "Dijeda", "Diperiksa dulu"],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatusAfter(value)}
                      aria-pressed={statusAfter === value}
                      className={`rounded-2xl border p-3 text-left cursor-pointer transition-colors ${statusAfter === value ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand/40"}`}
                    >
                      <p className="text-sm font-bold text-ink">{label}</p>
                      <p className="text-[11px] text-muted">{hint}</p>
                    </button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                disabled={blocked || formation.processing}
                loading={finalize.isPending}
                icon={<Icon name="check" size={15} />}
                onClick={() => finalize.mutate({ change_note: note.trim(), status_after: statusAfter, override_reason: reason.trim() }, { onSuccess: onDone })}
              >
                Final versi {formation.version_no}
              </Button>
              <p className="text-[11px] text-faint">
                Setelah Final, isian ini dipakai {agentName} bekerja dan hasil tanya jawab disimpan sebagai pengetahuan role.
                {hasActiveVersion ? " Versi lama tetap tercatat di tab Versi." : ""}
              </p>
            </CardContent>
          </Card>
          {hasActiveVersion && (
            <Button variant="ghost" className="w-full" icon={<Icon name="trash" size={14} />} onClick={handleDiscard} loading={discard.isPending}>
              Buang revisi ini
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
