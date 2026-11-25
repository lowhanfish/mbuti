"use client";

import Link from "next/link";
import React from "react";
import { formatDate } from "@/utilities/labels";
import { Card, CardHeader, CardTitle, EmptyState, Skeleton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { TaskStatusBadge } from "../../../tugas/components/TaskParts";
import { useResponseListTask } from "../../../tugas/hooks/crud";
import { formatRupiah } from "../../../tugas/types";
import type { ResponseInterface } from "../../types";

export default function TabRiwayat({ role }: { role: ResponseInterface }) {
  const { List, isLoading } = useResponseListTask({ agent_id: role.id });
  const tasks = List?.data ?? [];

  if (isLoading) return <Skeleton className="h-48 rounded-3xl" />;
  if (!tasks.length) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="list" size={26} />}
          title="Belum ada riwayat kerja"
          description={`Dibuat ${formatDate(role.created_at)}. Tugas yang melibatkan ${role.name} akan tercatat di sini.`}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tugas yang melibatkan {role.name}</CardTitle>
        <span className="text-xs text-faint">{tasks.length} tugas</span>
      </CardHeader>
      <ul className="divide-y divide-line/70">
        {tasks.map((t) => (
          <li key={t.id}>
            <Link href={`/admin/tugas/${t.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/70 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">{t.title}</p>
                <p className="text-[11px] text-faint">
                  {t.entry_agent.id === role.id ? "Penerima pertama" : `Lewat relasi dari ${t.entry_agent.name}`} · {formatDate(t.created_at)} · {formatRupiah(t.cost_used)}
                </p>
              </div>
              <TaskStatusBadge status={t.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
