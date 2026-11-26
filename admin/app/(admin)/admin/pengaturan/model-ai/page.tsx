"use client";

import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import ApiKeyPanel from "./components/ApiKeyPanel";
import ModelProfileForm from "./components/ModelProfileForm";
import { useResponseModelSettings, useUpdateModelSettings } from "./hooks/crud";

export default function PengaturanModelAiPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";
  const { Settings, isLoading, isError, error, refetch } = useResponseModelSettings();
  const update = useUpdateModelSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model AI"
        description="Pilih model Gemini untuk tiap profil kerja role."
        badge={!canEdit ? <Badge>Hanya baca</Badge> : undefined}
      />

      {isError ? (
        <Card>
          <EmptyState
            icon={<Icon name="cpu" size={26} />}
            title="Pengaturan model gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        </Card>
      ) : isLoading || !Settings ? (
        <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Memuat pengaturan">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <ModelProfileForm
            key={Settings.updated_at}
            settings={Settings}
            canEdit={canEdit}
            saving={update.isPending}
            onSubmit={(body) => update.mutate(body)}
          />
          <ApiKeyPanel settings={Settings} canSee={accessRole === "owner"} />
        </>
      )}
    </div>
  );
}
