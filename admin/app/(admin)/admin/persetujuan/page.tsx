"use client";

import React, { useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, SkeletonCard } from "../../_components/ui";
import { Icon } from "../../_components/admin-icons";
import { BrandMascot } from "../../_components/brand-mark";
import ApprovalCard from "../tugas/components/ApprovalCard";
import { useResponseApprovals } from "../tugas/hooks/crud";

const HISTORY_PAGE_SIZE = 10;

export default function PersetujuanPage() {
  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const [page, setPage] = useState(1);
  // Antrean tampil seluruhnya; riwayat berhalaman
  const pageSize = tab === "decided" ? HISTORY_PAGE_SIZE : 200;
  const { List, total, pendingCount, isLoading, isError, error, refetch } = useResponseApprovals(tab, tab === "decided" ? page : 1, pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Persetujuan"
        description="Keputusan yang menunggu Anda: hasil yang dieskalasi role, relasi yang perlu izin, atau revisi yang melewati batas."
        badge={pendingCount > 0 && <Badge variant="accent">{pendingCount} menunggu</Badge>}
      />

      <div className="glass rounded-2xl p-1.5 inline-flex gap-1" role="tablist" aria-label="Kotak persetujuan">
        {(
          [
            ["pending", "Menunggu", pendingCount],
            ["decided", "Riwayat", null],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
            className={`h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              tab === key ? "bg-gradient-to-r from-brand to-[#9b6bff] text-white shadow-md" : "text-muted hover:text-ink hover:bg-surface/80"
            }`}
          >
            {label}
            {count !== null && count > 0 && <span className="rounded-md bg-white/25 px-1.5 text-[11px]">{count}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard className="h-48" />
          <SkeletonCard className="h-48" />
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            icon={<Icon name="approval" size={26} />}
            title="Kotak persetujuan gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        </Card>
      ) : List.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center text-center gap-2 py-10 px-6">
            <BrandMascot width={170} />
            <p className="text-base font-bold text-ink">{tab === "pending" ? "Tidak ada yang menunggu keputusan" : "Belum ada riwayat keputusan"}</p>
            <p className="text-sm text-muted max-w-md">
              {tab === "pending" ? "Kantor berjalan lancar. Permintaan baru akan muncul di sini." : "Keputusan yang sudah diambil akan tercatat di sini."}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4 stagger">
          {List.map((a) => (
            <ApprovalCard key={a.id} approval={a} showTask />
          ))}
          {tab === "decided" && total > HISTORY_PAGE_SIZE && (
            <Pagination page={page} onPageChange={setPage} pageSize={HISTORY_PAGE_SIZE} total={total} />
          )}
        </div>
      )}
    </div>
  );
}
