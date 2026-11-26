"use client";

import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import BudgetForm from "./components/BudgetForm";
import UsageCard from "./components/UsageCard";
import { useResponseBudgetSettings, useUpdateBudgetSettings } from "./hooks/crud";

export default function PengaturanBatasBiayaPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";
  const { Budget, isLoading, isError, error, refetch } = useResponseBudgetSettings();
  const update = useUpdateBudgetSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batas Biaya"
        description="Pengaman agar role tidak bekerja tanpa batas: biaya, langkah, dan putaran revisi."
        badge={!canEdit ? <Badge>Hanya baca</Badge> : undefined}
      />

      {isError ? (
        <Card>
          <EmptyState
            icon={<Icon name="wallet" size={26} />}
            title="Batas biaya gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        </Card>
      ) : isLoading || !Budget ? (
        <div className="space-y-4" role="status" aria-label="Memuat batas biaya">
          <Skeleton className="h-52 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      ) : (
        <>
          <UsageCard budget={Budget} />
          <BudgetForm
            key={Budget.updated_at}
            budget={Budget}
            canEdit={canEdit}
            saving={update.isPending}
            onSubmit={(body) => update.mutate(body)}
          />
        </>
      )}
    </div>
  );
}
