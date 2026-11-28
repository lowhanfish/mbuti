"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { Suspense, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { TaskStatusBadge } from "../../components/TaskParts";
import { formatRupiah } from "../../types";
import OccurrenceList from "../components/OccurrenceList";
import ScheduleModal from "../components/ScheduleModal";
import { useDeleteSchedule, useResponseDetailSchedule, useScheduleAction } from "../hooks/crud";
import { CAN_BACKFILL, RUN_STATUS, SCHEDULE_STATUS, formatDateTime } from "../types";

function ScheduleDetailView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { Schedule: s, isLoading, isError, error } = useResponseDetailSchedule(id);
  const action = useScheduleAction();
  const remove = useDeleteSchedule();
  const [editOpen, setEditOpen] = useState(false);

  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="task" size={26} />}
          title="Tugas rutin tidak dapat dibuka"
          description={error instanceof Error ? error.message : undefined}
          action={
            <Link href="/admin/tugas/rutin" className="text-sm font-semibold text-brand hover:underline">
              Kembali ke daftar
            </Link>
          }
        />
      </Card>
    );
  }
  if (isLoading || !s) return <Skeleton className="h-64 rounded-3xl" />;

  const busy = action.isPending;

  return (
    <div className="space-y-5">
      <Link href="/admin/tugas/rutin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand">
        <Icon name="chevron" size={14} className="rotate-90" />
        Semua tugas rutin
      </Link>

      <Card glow>
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge size="sm" dot variant={SCHEDULE_STATUS[s.status].variant}>
                {SCHEDULE_STATUS[s.status].label}
              </Badge>
              <Badge size="sm">
                {s.entry_agent.name} · {s.entry_agent.title}
              </Badge>
              <Badge size="sm">{formatRupiah(s.budget_limit)} per putaran</Badge>
            </div>
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">{s.title}</h2>
            <p className="text-sm font-semibold text-ink">{s.rule_text}</p>
            <p className="text-sm text-muted whitespace-pre-line break-words">{s.brief || "Tanpa arahan tambahan."}</p>
          </div>
          {s.can_manage && (
            <div className="flex flex-wrap gap-2">
              {s.status === "active" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => action.mutate({ id: s.id, action: "jeda" })}>
                  Jeda
                </Button>
              )}
              {(s.status === "paused" || s.status === "draft") && (
                <Button size="sm" disabled={busy} onClick={() => action.mutate({ id: s.id, action: "lanjutkan" })}>
                  {s.status === "draft" ? "Aktifkan" : "Lanjutkan"}
                </Button>
              )}
              <Button
                size="sm"
                variant="dark"
                disabled={busy}
                icon={<Icon name="sparkles" size={15} />}
                onClick={async () => {
                  if (await confirmAlert("Jalankan sekarang?", "Satu tugas dibuat sekarang, di luar jadwal.", "Ya, jalankan")) action.mutate({ id: s.id, action: "jalankan" });
                }}
              >
                Jalankan sekarang
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
                Ubah
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={remove.isPending}
                icon={<Icon name="trash" size={15} />}
                onClick={async () => {
                  if (await confirmAlert("Hapus tugas rutin ini?", "Jadwal dan riwayat putarannya dihapus. Tugas yang sudah dibuat tetap ada.", "Ya, hapus")) {
                    remove.mutate(s.id, { onSuccess: () => router.push("/admin/tugas/rutin") });
                  }
                }}
              >
                Hapus
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[300px_1fr] items-start">
        <Card>
          <CardHeader>
            <CardTitle>Putaran berikutnya</CardTitle>
          </CardHeader>
          <CardContent>
            {s.status === "active" ? <OccurrenceList items={s.upcoming} /> : <p className="text-xs text-muted">Jadwal tidak aktif, jadi tidak ada putaran yang akan berjalan.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat putaran</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jadwal</TableHead>
                <TableHead>Hasil</TableHead>
                <TableHead>Tugas</TableHead>
                <TableHead>
                  <span className="sr-only">Aksi</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.runs.length === 0 && <TableEmpty colSpan={4} message="Belum ada putaran." />}
              {s.runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-semibold text-ink">{formatDateTime(r.planned_for)}</span>
                    {r.attempt > 1 && <span className="block text-[11px] text-faint">percobaan ke-{r.attempt}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge size="sm" variant={RUN_STATUS[r.status].variant}>
                      {RUN_STATUS[r.status].label}
                    </Badge>
                    {r.reason && <span className="block text-[11px] text-muted mt-1">{r.reason}</span>}
                  </TableCell>
                  <TableCell>
                    {r.task_id && r.task_status ? (
                      <Link href={`/admin/tugas/${r.task_id}`} className="inline-flex items-center gap-2 text-xs font-semibold text-brand hover:underline">
                        <TaskStatusBadge status={r.task_status} />
                        Buka{r.attachment_count > 0 ? ` · ${r.attachment_count} lampiran` : ""}
                      </Link>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.can_manage && CAN_BACKFILL.includes(r.status) && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => action.mutate({ id: s.id, action: `susulan/${r.id}` })}>
                        Isi susulan
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {editOpen && <ScheduleModal editing={s} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

export default function TugasRutinDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-3xl" />}>
      <ScheduleDetailView />
    </Suspense>
  );
}
