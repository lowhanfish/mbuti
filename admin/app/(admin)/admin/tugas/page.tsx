"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Button, Card, EmptyState, Input, PageHeader, SkeletonCard } from "../../_components/ui";
import { Icon } from "../../_components/admin-icons";
import CreateTaskModal from "./components/CreateTaskModal";
import { TaskCard } from "./components/TaskParts";
import { useCreateTask, useResponseListTask } from "./hooks/crud";

const FILTERS = [
  { value: "", label: "Semua" },
  { value: "active", label: "Berjalan" },
  { value: "waiting", label: "Menunggu keputusan" },
  { value: "done", label: "Selesai" },
  { value: "stopped", label: "Dihentikan / ditolak" },
];

export default function TugasPage() {
  const router = useRouter();
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canCreate = accessRole !== "viewer";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(handler);
  }, [search]);

  const { List, isLoading, isError, error, refetch } = useResponseListTask({ search: debouncedSearch, status });
  const createTask = useCreateTask();
  const tasks = List?.data ?? [];
  const s = List?.summary;
  const counts: Record<string, number> = s
    ? {
        "": Object.values(s).reduce((a, b) => a + b, 0),
        active: s.queued + s.running,
        waiting: s.waiting_approval,
        done: s.completed,
        stopped: s.failed + s.cancelled + s.stopped_budget,
      }
    : {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tugas"
        description="Pekerjaan yang diberikan ke role. Tugas berjalan mengikuti Peta Relasi dan berhenti di titik persetujuan manusia."
        action={
          canCreate && (
            <Button icon={<Icon name="plus" size={16} />} onClick={() => setCreateOpen(true)}>
              Buat tugas
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-5 py-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Saring status">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                role="tab"
                aria-selected={status === f.value}
                onClick={() => setStatus(f.value)}
                className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  status === f.value ? "bg-ink text-canvas shadow-md" : "bg-surface/70 text-muted hover:text-ink hover:bg-surface"
                }`}
              >
                {f.label}
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${status === f.value ? "bg-canvas/20 text-canvas" : "bg-canvas"}`}>{counts[f.value] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="xl:w-72">
            <Input aria-label="Cari tugas" placeholder="Cari judul atau arahan…" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Icon name="search" size={16} />} />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} className="h-60" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            icon={<Icon name="task" size={26} />}
            title="Tugas gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        </Card>
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="task" size={26} />}
            title={status || debouncedSearch ? "Tidak ada tugas yang cocok" : "Belum ada tugas"}
            description={status || debouncedSearch ? "Ubah saringan atau kata pencarian." : "Beri tugas pertama ke salah satu role aktif."}
            action={
              canCreate && !status && !debouncedSearch ? (
                <Button icon={<Icon name="plus" size={16} />} onClick={() => setCreateOpen(true)}>
                  Buat tugas pertama
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}

      {createOpen && (
        <CreateTaskModal
          saving={createTask.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={(body) =>
            createTask.mutate(body, {
              onSuccess: (res) => {
                setCreateOpen(false);
                router.push(`/admin/tugas/${res.data.id}`);
              },
            })
          }
        />
      )}
    </div>
  );
}
