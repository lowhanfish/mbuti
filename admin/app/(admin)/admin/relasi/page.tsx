"use client";

import dynamic from "next/dynamic";
import React from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "../../_components/ui";
import { Icon } from "../../_components/admin-icons";
import { useResponseGraph } from "./hooks/crud";

/** React Flow hanya dimuat di peramban. */
const RelationMap = dynamic(() => import("./components/RelationMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-[calc(100vh-190px)] min-h-[520px] rounded-[28px]" />,
});

export default function RelasiPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";
  const { Graph, isLoading, isError, error, refetch } = useResponseGraph();

  const agentCount = Graph?.nodes.filter((n) => n.kind === "agent").length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Peta Relasi"
        description="Atur siapa menyerahkan ke siapa, siapa memeriksa, dan kapan manusia harus memutuskan."
        badge={Graph && <Badge variant="info">{Graph.relations.length} relasi</Badge>}
      />

      {isLoading ? (
        <Skeleton className="h-[calc(100vh-190px)] min-h-[520px] rounded-[28px]" />
      ) : isError || !Graph ? (
        <Card>
          <EmptyState
            icon={<Icon name="flow" size={26} />}
            title="Peta relasi gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        </Card>
      ) : agentCount === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="flow" size={26} />}
            title="Belum ada role untuk dihubungkan"
            description="Buat minimal dua role di menu Role, lalu kembali ke sini untuk menghubungkannya."
          />
        </Card>
      ) : (
        <RelationMap graph={Graph} canEdit={canEdit} />
      )}
    </div>
  );
}
