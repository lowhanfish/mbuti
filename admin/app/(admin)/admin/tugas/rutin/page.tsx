"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonCard } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import TaskTabs from "../components/TaskTabs";
import ScheduleModal from "./components/ScheduleModal";
import { useResponseListSchedule } from "./hooks/crud";
import { RUN_STATUS, SCHEDULE_STATUS, formatDateTime } from "./types";

export default function TugasRutinPage() {
  const router = useRouter();
  const canCreate = useAuthStore((state) => state.user?.access_role) !== "viewer";
  const { List, isLoading, isError, error, refetch } = useResponseListSchedule();
  const [createOpen, setCreateOpen] = useState(false);

  const createButton = (label: string) => (
    <Button icon={<Icon name="plus" size={16} />} onClick={() => setCreateOpen(true)}>
      {label}
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Tugas rutin" description="Tugas yang dibuat otomatis menurut jadwal dan kalender kerja organisasi Anda." action={canCreate && createButton("Buat tugas rutin")} />
      <TaskTabs active="/admin/tugas/rutin" />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-40" />
        </div>
      ) : isError ? (
        <Card>
          <EmptyState icon={<Icon name="task" size={26} />} title="Tugas rutin gagal dimuat" description={error instanceof Error ? error.message : undefined} action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>} />
        </Card>
      ) : List.length === 0 ? (
        <Card>
          <EmptyState icon={<Icon name="task" size={26} />} title="Belum ada tugas rutin" description="Contoh: laporan harian setiap hari kerja pukul 16.05." action={canCreate ? createButton("Buat tugas rutin pertama") : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 stagger">
          {List.map((s) => (
            <Link key={s.id} href={`/admin/tugas/rutin/${s.id}`} className="block">
              <Card interactive className="h-full p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-xl flex items-end justify-center overflow-hidden shrink-0" style={{ background: `${s.entry_agent.unit_color ?? "#7c4dff"}2a` }}>
                    <Avatar2D avatar={s.entry_agent.avatar} size={40} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink truncate">{s.title}</p>
                    <p className="text-xs text-muted truncate">
                      {s.entry_agent.name} · {s.entry_agent.title}
                    </p>
                  </div>
                  <Badge size="sm" dot variant={SCHEDULE_STATUS[s.status].variant}>
                    {SCHEDULE_STATUS[s.status].label}
                  </Badge>
                </div>
                <p className="text-sm text-ink">{s.rule_text}</p>
                <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
                  <div>
                    <dt className="text-faint">Putaran berikutnya</dt>
                    <dd className="font-semibold text-ink">{s.next_run_at ? formatDateTime(s.next_run_at) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">Hasil terakhir</dt>
                    <dd>{s.last_run ? <Badge size="sm" variant={RUN_STATUS[s.last_run.status].variant}>{RUN_STATUS[s.last_run.status].label}</Badge> : <span className="text-muted">Belum pernah jalan</span>}</dd>
                  </div>
                </dl>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {createOpen && <ScheduleModal onClose={() => setCreateOpen(false)} onSaved={(id) => router.push(`/admin/tugas/rutin/${id}`)} />}
    </div>
  );
}
