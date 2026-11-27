"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { Suspense, useState } from "react";
import { Badge, Button, Card, EmptyState, Skeleton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { Avatar2D } from "../../../../_components/agent/avatar-2d";
import { REVISION_STATUS_LABEL, isOpenRevision, type FormationInterface } from "../../formation-types";
import { useResponseDetailRole } from "../../hooks/crud";
import { useFormation, useStartRevision } from "../../hooks/formation";
import StepBahan from "./components/StepBahan";
import StepFinal from "./components/StepFinal";
import StepKartu from "./components/StepKartu";
import StepTanyaJawab from "./components/StepTanyaJawab";

const STEPS = [
  { key: "bahan", label: "Bahan", icon: "book" },
  { key: "kartu", label: "Kartu", icon: "sparkles" },
  { key: "tanya", label: "Tanya jawab", icon: "mail" },
  { key: "final", label: "Final", icon: "check" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** Langkah yang sedang berlangsung menurut status revisi. */
const currentStep = (f: FormationInterface): StepKey => {
  if (f.status === "draft") return "bahan";
  if (f.status === "analyzing") return "kartu";
  if (f.status === "ready") return "final";
  return "tanya";
};

const reached = (f: FormationInterface, step: StepKey) => {
  if (step === "bahan") return true;
  if (!f.card) return step === "kartu" && f.status === "analyzing";
  return true;
};

function Formation() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { Role, isLoading: roleLoading, isError, error } = useResponseDetailRole(id);
  const { Formation: formation, isLoading } = useFormation(id);
  const start = useStartRevision(id);
  const [chosen, setChosen] = useState<StepKey | null>(null);

  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="agent" size={26} />}
          title="Role tidak dapat dibuka"
          description={error instanceof Error ? error.message : undefined}
          action={
            <Link href="/admin/role" className="text-sm font-semibold text-brand hover:underline">
              Kembali ke daftar role
            </Link>
          }
        />
      </Card>
    );
  }
  if (roleLoading || isLoading || !Role || !formation) return <Fallback />;

  const canEdit = formation.can_edit;
  const open = isOpenRevision(formation.status);
  const step = chosen ?? currentStep(formation);
  const color = Role.unit_color ?? "#7c4dff";

  return (
    <div className="space-y-5">
      <Link href={`/admin/role/${id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand">
        <Icon name="chevron" size={14} className="rotate-90" />
        Detail {Role.name}
      </Link>

      <Card glow className="relative">
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 8% 100%, ${color}40, transparent 45%)` }} aria-hidden="true" />
        <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-20 h-20 rounded-3xl flex items-end justify-center overflow-hidden shrink-0" style={{ background: `linear-gradient(160deg, ${color}25, ${color}66)` }}>
            <Avatar2D avatar={Role.avatar} size={72} />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-semibold text-brand">Pembentukan role</p>
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">
              {Role.name} <span className="text-muted font-semibold text-lg">· {Role.title}</span>
            </h2>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge size="sm" variant={open ? "info" : "success"} dot>
                Versi {formation.version_no} · {REVISION_STATUS_LABEL[formation.status]}
              </Badge>
              {Role.active_version_no > 0 && open && (
                <Badge size="sm" variant="neutral">
                  Versi {Role.active_version_no} tetap bekerja selama revisi disusun
                </Badge>
              )}
              {Role.active_version_no === 0 && (
                <Badge size="sm" variant="warning">
                  Belum menerima tugas sebelum Final
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      {!open ? (
        <Card>
          <EmptyState
            icon={<Icon name="check" size={26} />}
            title={`Versi ${formation.version_no} sudah Final`}
            description="Untuk mengubah keterampilan atau isian kerja, mulai revisi baru. Versi sekarang tetap dipakai sampai revisi itu Final."
            action={
              canEdit ? (
                <Button icon={<Icon name="edit" size={15} />} loading={start.isPending} onClick={() => start.mutate({}, { onSuccess: () => setChosen(null) })}>
                  Mulai revisi
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <nav className="glass rounded-2xl p-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1" aria-label="Langkah pembentukan">
            {STEPS.map((s, i) => {
              const enabled = reached(formation, s.key);
              const active = step === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={!enabled}
                  aria-current={active ? "step" : undefined}
                  onClick={() => setChosen(s.key)}
                  className={`h-11 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
                    active
                      ? "bg-gradient-to-r from-brand to-[#9b6bff] text-white shadow-[0_8px_18px_-8px_rgba(124,77,255,.9)]"
                      : enabled
                        ? "text-muted hover:text-ink hover:bg-surface/80 cursor-pointer"
                        : "text-faint/60 cursor-not-allowed"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center ${active ? "bg-white/20" : "bg-surface border border-line"}`}>{i + 1}</span>
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div key={step} className="rise">
            {step === "bahan" && <StepBahan agentId={id} agentName={Role.name} formation={formation} canEdit={canEdit} onAnalyzed={() => setChosen("kartu")} />}
            {step === "kartu" && <StepKartu agentId={id} formation={formation} canEdit={canEdit} onNext={() => setChosen("tanya")} />}
            {step === "tanya" && (
              <StepTanyaJawab agentId={id} agentName={Role.name} avatar={Role.avatar} formation={formation} canEdit={canEdit} onNext={() => setChosen("final")} />
            )}
            {step === "final" && (
              <StepFinal
                agentId={id}
                agentName={Role.name}
                formation={formation}
                canEdit={canEdit}
                hasActiveVersion={Role.active_version_no > 0}
                onDone={() => router.push(`/admin/role/${id}`)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Fallback() {
  return (
    <div className="space-y-4" role="status" aria-label="Memuat pembentukan role">
      <Skeleton className="h-32 rounded-3xl" />
      <Skeleton className="h-12 rounded-2xl" />
      <Skeleton className="h-96 rounded-3xl" />
    </div>
  );
}

export default function FormationPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <Formation />
    </Suspense>
  );
}
