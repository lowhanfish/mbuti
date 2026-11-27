"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { Suspense } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { formatDate } from "@/utilities/labels";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import ApprovalCard from "../components/ApprovalCard";
import { AgentStack, BudgetMeter, TaskStatusBadge } from "../components/TaskParts";
import { useCancelTask, useResponseDetailTask } from "../hooks/crud";
import { PRIORITY_LABEL, TASK_STATUS, formatRupiah } from "../types";
import { AttachmentStrip } from "../../../_components/media/image-findings";
import Timeline from "./components/Timeline";

function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { Task, isLoading, isError, error } = useResponseDetailTask(id);
  const cancel = useCancelTask();

  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="task" size={26} />}
          title="Tugas tidak dapat dibuka"
          description={error instanceof Error ? error.message : undefined}
          action={
            <Link href="/admin/tugas" className="text-sm font-semibold text-brand hover:underline">
              Kembali ke daftar tugas
            </Link>
          }
        />
      </Card>
    );
  }
  if (isLoading || !Task) return <DetailFallback />;

  const pending = Task.approvals.filter((a) => a.status === "pending");
  const decided = Task.approvals.filter((a) => a.status !== "pending");
  const stoppable = ["queued", "running", "waiting_approval"].includes(Task.status);
  const live = TASK_STATUS[Task.status].live;

  return (
    <div className="space-y-5">
      <Link href="/admin/tugas" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand">
        <Icon name="chevron" size={14} className="rotate-90" />
        Semua tugas
      </Link>

      <Card glow className="relative">
        {live && <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c4dff,#ffb81c,#7c4dff)] bg-[length:200%_100%] animate-shimmer" aria-hidden="true" />}
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={Task.status} />
              <Badge size="sm">Prioritas {PRIORITY_LABEL[Task.priority].toLowerCase()}</Badge>
              {Task.due_at && <Badge size="sm">Tenggat {formatDate(Task.due_at)}</Badge>}
            </div>
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">{Task.title}</h2>
            <p className="text-sm text-muted max-w-2xl whitespace-pre-line break-words">{Task.brief || "Tanpa arahan tambahan."}</p>
          </div>
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="text-center">
              <AgentStack agents={Task.participants} size={40} />
              <p className="text-[10px] text-faint mt-1">{Task.participants.length} role terlibat</p>
            </div>
            <div className="w-40">
              <BudgetMeter used={Task.cost_used} limit={Task.budget_limit} />
            </div>
            {stoppable && (
              <Button
                variant="outline"
                size="sm"
                loading={cancel.isPending}
                onClick={async () => {
                  if (await confirmAlert("Hentikan tugas ini?", "Langkah yang belum berjalan dibatalkan dan permintaan persetujuan ditutup.", "Ya, hentikan")) {
                    cancel.mutate(Task.id);
                  }
                }}
              >
                Hentikan
              </Button>
            )}
          </div>
        </div>
      </Card>

      {pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px] items-start">
        <Card>
          <CardHeader>
            <CardTitle>Linimasa</CardTitle>
            {live && (
              <span className="text-[11px] font-semibold text-brand flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-ping" />
                Diperbarui langsung
              </span>
            )}
          </CardHeader>
          <CardContent>
            <Timeline task={Task} />
          </CardContent>
        </Card>

        <div className="space-y-4 xl:sticky xl:top-24">
          <Card>
            <CardHeader>
              <CardTitle>Ringkasan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              {[
                ["Mulai dari", `${Task.entry_agent.name} · ${Task.entry_agent.title}`],
                ["Dibuat oleh", Task.created_by_name ?? "—"],
                ["Dibuat", formatDate(Task.created_at)],
                ["Langkah selesai", `${Task.steps_done} dari ${Task.step_count}`],
                ["Biaya", formatRupiah(Task.cost_used)],
                ["Selesai", Task.completed_at ? formatDate(Task.completed_at) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="text-muted">{k}</span>
                  <span className="text-ink font-medium text-right">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {Task.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Lampiran</CardTitle>
                <span className="text-[11px] text-faint">{Task.attachments.length} berkas</span>
              </CardHeader>
              <CardContent>
                <AttachmentStrip attachments={Task.attachments} />
              </CardContent>
            </Card>
          )}

          {Task.inputs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Isian tugas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {Task.inputs.map((i) => (
                  <div key={i.label}>
                    <p className="text-[11px] font-semibold text-faint">{i.label}</p>
                    <p className="text-sm text-ink">{i.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {decided.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Keputusan manusia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {decided.map((a) => (
                  <div key={a.id} className="text-xs">
                    <p className="font-semibold text-ink">
                      {a.decided_by_name} · {a.status === "approved" ? "menyetujui" : a.status === "revise" ? "meminta revisi" : "menolak"}
                    </p>
                    {a.comment && <p className="text-muted">“{a.comment}”</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailFallback() {
  return (
    <div className="space-y-4" role="status" aria-label="Memuat tugas">
      <Skeleton className="h-36 rounded-3xl" />
      <Skeleton className="h-[420px] rounded-3xl" />
    </div>
  );
}

/** useParams() adalah data saat permintaan; dibungkus Suspense agar rute dinamis bisa diprerender. */
export default function TaskDetailPage() {
  return (
    <Suspense fallback={<DetailFallback />}>
      <TaskDetail />
    </Suspense>
  );
}
