"use client";

import Link from "next/link";
import React, { useState } from "react";
import { formatDate } from "@/utilities/labels";
import { Badge, Button, Card, EmptyState, Skeleton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { useDecideProposal, useProposals } from "../hooks/crud";
import type { ProposalStatus } from "../types";

const STATUS: Record<ProposalStatus, { label: string; variant: "warning" | "success" | "neutral" }> = {
  pending: { label: "Menunggu", variant: "warning" },
  approved: { label: "Disetujui", variant: "success" },
  rejected: { label: "Ditolak", variant: "neutral" },
};

/** Usulan temuan internet menjadi pengetahuan organisasi; admin menyetujui atau menolak. */
export default function ProposalList({ canDecide }: { canDecide: boolean }) {
  const [status, setStatus] = useState<ProposalStatus | "">("pending");
  const { Proposals, summary, isLoading } = useProposals(status);
  const decide = useDecideProposal();

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-1.5 px-5 py-4 border-b border-line/70">
        {(["pending", "approved", "rejected", ""] as const).map((s) => (
          <button
            key={s || "semua"}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={`h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${status === s ? "bg-ink text-canvas border-ink" : "bg-surface border-line text-muted hover:text-ink"}`}
          >
            {s ? STATUS[s].label : "Semua"}
            {s && summary ? ` (${summary[s]})` : ""}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : !Proposals.length ? (
        <EmptyState
          icon={<Icon name="search" size={26} />}
          title="Tidak ada usulan"
          description="Usulan muncul saat pengguna menekan Usulkan sebagai pengetahuan pada sumber internet di hasil tugas atau uji coba."
        />
      ) : (
        <ul className="divide-y divide-line/70">
          {Proposals.map((p) => (
            <li key={p.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:text-brand truncate">
                    {p.title}
                  </a>
                  <Badge size="sm" variant={STATUS[p.status].variant}>
                    {STATUS[p.status].label}
                  </Badge>
                </div>
                <p className="text-[11px] text-faint truncate">{p.url}</p>
                {p.excerpt && <p className="text-xs text-muted leading-relaxed">{p.excerpt}</p>}
                <p className="text-[11px] text-faint">
                  Diusulkan {p.proposed_by_name ?? "—"}
                  {p.agent_name ? ` dari hasil ${p.agent_name}` : ""}
                  {p.task_title ? ` · tugas "${p.task_title}"` : ""} · {formatDate(p.created_at)}
                  {p.decided_by_name ? ` · diputuskan ${p.decided_by_name}` : ""}
                </p>
                {p.document_id && (
                  <Link href={`/admin/pengetahuan/${p.document_id}`} className="text-xs font-semibold text-brand hover:underline">
                    Buka dokumen
                  </Link>
                )}
              </div>
              {canDecide && p.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" loading={decide.isPending} onClick={() => decide.mutate({ id: p.id, decision: "tolak" })}>
                    Tolak
                  </Button>
                  <Button size="sm" loading={decide.isPending} icon={<Icon name="check" size={14} />} onClick={() => decide.mutate({ id: p.id, decision: "setujui" })}>
                    Simpan ke pengetahuan
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
