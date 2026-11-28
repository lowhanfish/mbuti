"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { Suspense, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { useAuthStore } from "@/store/useAuthStore";
import { Button, Card, EmptyState, Skeleton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { AgentStatusBadge } from "../components/RoleParts";
import { useDeleteRole, useResponseDetailRole, useUpdateRole } from "../hooks/crud";
import { MODEL_PROFILE_LABEL, OUTPUT_FORMAT_LABEL } from "../types";
import TabInstruksi from "./components/TabInstruksi";
import TabProfil from "./components/TabProfil";
import TabUjiCoba from "./components/TabUjiCoba";
import TabDokumen from "./components/TabDokumen";
import TabRelasi from "./components/TabRelasi";
import TabRiwayat from "./components/TabRiwayat";
import TabPembentukan from "./components/TabPembentukan";
import TabVersi from "./components/TabVersi";
import TabBrankas from "./components/TabBrankas";
import TabAlur from "./components/TabAlur";
import { buttonClasses } from "../../../_components/ui/button-classes";
import { REVISION_STATUS_LABEL } from "../formation-types";

const TABS = [
  { key: "profil", label: "Profil", icon: "agent" },
  { key: "pembentukan", label: "Pembentukan", icon: "sparkles" },
  { key: "instruksi", label: "Instruksi", icon: "task" },
  { key: "dokumen", label: "Dokumen", icon: "book" },
  { key: "brankas", label: "Brankas", icon: "lock" },
  { key: "alur", label: "Alur aplikasi", icon: "flow" },
  { key: "relasi", label: "Relasi", icon: "flow" },
  { key: "uji", label: "Uji coba", icon: "sparkles" },
  { key: "riwayat", label: "Riwayat", icon: "list" },
  { key: "versi", label: "Versi", icon: "tree" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function RoleDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";
  const [tab, setTab] = useState<TabKey>("profil");

  const { Role, isLoading, isError, error } = useResponseDetailRole(id);
  const updateMutation = useUpdateRole(id);
  const deleteMutation = useDeleteRole();

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

  if (isLoading || !Role) return <DetailFallback />;

  const color = Role.unit_color ?? "#7c4dff";
  const save = (body: Parameters<typeof updateMutation.mutate>[0]) => updateMutation.mutate(body);

  const handleDelete = async () => {
    const ok = await confirmAlert(
      `Hapus role "${Role.name}"?`,
      "Role dan relasinya dihapus dari daftar. Riwayat tugas yang pernah dikerjakannya tetap tersimpan.",
      "Ya, hapus"
    );
    if (ok) deleteMutation.mutate(Role.id, { onSuccess: () => router.push("/admin/role") });
  };

  const facts = [
    { label: "Unit", value: Role.unit_name ?? "Belum ditempatkan" },
    { label: "Penanggung jawab", value: Role.owner_name ?? "Belum ada" },
    { label: "Model", value: MODEL_PROFILE_LABEL[Role.model_profile].label },
    { label: "Bentuk hasil", value: OUTPUT_FORMAT_LABEL[Role.output_format] },
  ];

  return (
    <div className="space-y-5">
      <Link href="/admin/role" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand">
        <Icon name="chevron" size={14} className="rotate-90" />
        Semua role
      </Link>

      <Card glow className="relative">
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(circle at 12% 100%, ${color}40, transparent 45%), radial-gradient(circle at 100% 0%, rgba(255,184,28,.22), transparent 45%)` }}
          aria-hidden="true"
        />
        <div className="relative p-5 sm:p-7 flex flex-col md:flex-row md:items-center gap-5">
          <div
            className="w-28 h-28 rounded-[30px] flex items-end justify-center shrink-0 overflow-hidden shadow-inner"
            style={{ background: `linear-gradient(160deg, ${color}25, ${color}66)` }}
          >
            <Avatar2D avatar={Role.avatar} size={100} className="animate-float" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">{Role.name}</h2>
              <AgentStatusBadge status={Role.status} />
              <span className="text-[11px] font-semibold rounded-full bg-surface/80 border border-rim px-2.5 py-1 text-muted">
                {Role.active_version_no > 0 ? `Versi ${Role.active_version_no}` : "Belum Final"}
              </span>
              {Role.revision_status && (
                <span className="text-[11px] font-semibold rounded-full bg-brand-soft text-brand-strong px-2.5 py-1">
                  Revisi: {REVISION_STATUS_LABEL[Role.revision_status]}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-brand">{Role.title}</p>
            <p className="text-sm text-muted max-w-2xl leading-relaxed">{Role.goal || "Belum ada tujuan kerja."}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {facts.map((f) => (
                <span key={f.label} className="text-[11px] rounded-full bg-surface/80 border border-rim px-2.5 py-1 text-muted">
                  {f.label}: <strong className="text-ink font-semibold">{f.value}</strong>
                </span>
              ))}
            </div>
          </div>
          {canEdit && (
            <div className="flex md:flex-col gap-2 shrink-0">
              {Role.active_version_no === 0 ? (
                <Link href={`/admin/role/${Role.id}/bentuk`} className={buttonClasses("primary", "sm")}>
                  <Icon name="sparkles" size={14} />
                  Lanjutkan pembentukan
                </Link>
              ) : Role.status === "active" ? (
                <Button variant="outline" size="sm" onClick={() => save({ status: "paused" })} loading={updateMutation.isPending}>
                  Jeda
                </Button>
              ) : (
                <Button size="sm" onClick={() => save({ status: "active" })} loading={updateMutation.isPending}>
                  Aktifkan
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={handleDelete}>
                Hapus
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="glass rounded-2xl p-1.5 flex gap-1 overflow-x-auto" role="tablist" aria-label="Bagian role">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              tab === t.key
                ? "bg-gradient-to-r from-brand to-[#9b6bff] text-white shadow-[0_8px_18px_-8px_rgba(124,77,255,.9)]"
                : "text-muted hover:text-ink hover:bg-surface/80"
            }`}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      <div key={tab} className="rise" role="tabpanel">
        {tab === "profil" && (
          <TabProfil key={Role.updated_at} role={Role} canEdit={canEdit} saving={updateMutation.isPending} onSave={save} />
        )}
        {tab === "instruksi" && (
          <TabInstruksi key={Role.updated_at} role={Role} canEdit={canEdit} saving={updateMutation.isPending} onSave={save} />
        )}
        {tab === "dokumen" && <TabDokumen role={Role} canEdit={canEdit} />}
        {tab === "brankas" && <TabBrankas role={Role} />}
        {tab === "alur" && <TabAlur role={Role} />}
        {tab === "relasi" && <TabRelasi role={Role} />}
        {tab === "uji" && <TabUjiCoba role={Role} />}
        {tab === "riwayat" && <TabRiwayat role={Role} />}
        {tab === "pembentukan" && <TabPembentukan role={Role} />}
        {tab === "versi" && <TabVersi role={Role} />}
      </div>
    </div>
  );
}

function DetailFallback() {
  return (
    <div className="space-y-4" role="status" aria-label="Memuat role">
      <Skeleton className="h-44 rounded-3xl" />
      <Skeleton className="h-12 rounded-2xl" />
      <Skeleton className="h-96 rounded-3xl" />
    </div>
  );
}

/** useParams() adalah data saat permintaan; dibungkus Suspense agar rute dinamis bisa diprerender. */
export default function RoleDetailPage() {
  return (
    <Suspense fallback={<DetailFallback />}>
      <RoleDetail />
    </Suspense>
  );
}
