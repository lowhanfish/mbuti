"use client";

import { useAuthStore } from "@/store/useAuthStore";
import { formatDate, initials } from "@/utilities/labels";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, SkeletonCard, StatCard } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import ProfileForm from "./components/ProfileForm";
import { useResponseProfile, useUpdateProfile } from "./hooks/crud";
import { SECTOR_OPTIONS } from "./types";

export default function OrganisasiProfilPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";
  const { Profile, isLoading, isError, error, refetch } = useResponseProfile();
  const updateMutation = useUpdateProfile();

  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="building" size={26} />}
          title="Profil organisasi gagal dimuat"
          description={error instanceof Error ? error.message : undefined}
          action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profil Organisasi" description="Identitas organisasi yang memakai MBUTI." />

      {isLoading || !Profile ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ) : (
        <>
          <Card glow className="relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,184,28,.25),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(124,77,255,.2),transparent_55%)]" aria-hidden="true" />
            <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-20 h-20 rounded-[26px] bg-gradient-to-br from-ink via-[#3b2580] to-brand text-accent text-2xl font-extrabold flex items-center justify-center shadow-[0_18px_30px_-12px_rgba(76,40,170,.7)] shrink-0">
                {initials(Profile.name)}
              </div>
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-extrabold text-ink tracking-tight">{Profile.name}</h2>
                  <Badge variant="info">{SECTOR_OPTIONS.find((s) => s.value === Profile.sector)?.label}</Badge>
                </div>
                <p className="text-sm text-muted max-w-2xl leading-relaxed">{Profile.description || "Belum ada deskripsi."}</p>
                <p className="text-[11px] text-faint">
                  Alamat ruang kerja: <span className="font-mono">{Profile.slug}</span> · Dibuat {formatDate(Profile.created_at)} ·
                  Diperbarui {formatDate(Profile.updated_at)}
                </p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3 stagger">
            <StatCard label="Unit / divisi" value={Profile.stats.unit_count} icon={<Icon name="building" size={22} />} tone="brand" />
            <StatCard label="Anggota tim" value={Profile.stats.member_count} icon={<Icon name="users" size={22} />} tone="accent" />
            <StatCard label="Role AI" value={Profile.stats.agent_count} icon={<Icon name="agent" size={22} />} tone="pink" />
          </div>

          <ProfileForm
            key={Profile.updated_at}
            profile={Profile}
            canEdit={canEdit}
            saving={updateMutation.isPending}
            onSubmit={(body) => updateMutation.mutate(body)}
          />
        </>
      )}
    </div>
  );
}
