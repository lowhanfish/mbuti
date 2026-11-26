"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, StatCard } from "../_components/ui";
import { buttonClasses } from "../_components/ui/button-classes";
import { Icon } from "../_components/admin-icons";
import { BrandMascot } from "../_components/brand-mark";
import BudgetCard from "./dashboard/components/BudgetCard";
import BusyAgents from "./dashboard/components/BusyAgents";
import DailyCostChart from "./dashboard/components/DailyCostChart";
import { useResponseDashboard } from "./dashboard/hooks/crud";
import { AgentStack, TaskStatusBadge } from "./tugas/components/TaskParts";
import { useResponseListTask } from "./tugas/hooks/crud";
import { formatRupiah } from "./tugas/types";

const noop = () => () => {};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
};

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  // Sapaan dihitung di peramban (jam lokal), "Halo" saat prerender agar tidak terjadi hydration mismatch
  const hello = useSyncExternalStore(noop, greeting, () => "Halo");
  const { Summary, isLoading, isError, error, refetch } = useResponseDashboard();
  const { List: Tasks, isLoading: tasksLoading } = useResponseListTask({});
  const s = Summary?.tasks;
  const running = s ? s.queued + s.running : 0;
  const waiting = Summary?.pending_approval_count ?? 0;
  const budget = Summary?.budget;
  const recent = (Tasks?.data ?? []).slice(0, 5);
  const STATS = [
    { label: "Tugas berjalan", value: running, icon: "task", hint: `${s?.completed ?? 0} selesai`, tone: "brand" },
    { label: "Menunggu keputusan Anda", value: waiting, icon: "approval", hint: waiting ? "Buka Persetujuan" : "Tidak ada antrean", tone: "accent" },
    {
      label: "Role aktif",
      value: Summary?.agents.active ?? 0,
      icon: "agent",
      hint: `${Summary?.agents.draft ?? 0} draf · ${Summary?.agents.paused ?? 0} dijeda`,
      tone: "pink",
    },
    {
      label: "Biaya bulan ini",
      value: formatRupiah(budget?.used ?? 0),
      icon: "wallet",
      hint: budget ? `dari batas ${formatRupiah(budget.limit)}` : "",
      tone: "teal",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <Card glow className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-soft/80 via-surface/40 to-accent-soft/80" aria-hidden="true" />
        <div className="relative grid md:grid-cols-[1fr_auto] items-center gap-4 p-6 sm:p-8">
          <div className="space-y-3">
            <Badge variant="dark" dot>
              {user?.organization?.name ?? "Organisasi"}
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {hello}, <span className="text-gradient">{user?.full_name?.split(" ")[0] ?? "Tim"}</span>!
            </h2>
            {isLoading ? (
              <div className="space-y-2 max-w-md motion-safe:animate-pulse" aria-busy="true" aria-label="Memuat ringkasan">
                <div className="h-3.5 w-full rounded-md bg-brand-soft" />
                <div className="h-3.5 w-2/3 rounded-md bg-brand-soft/70" />
              </div>
            ) : (
            <p className="text-sm text-muted max-w-lg leading-relaxed">
              {running > 0
                ? `${running} tugas sedang dikerjakan role AI${waiting ? ` dan ${waiting} menunggu keputusan Anda` : ""}.`
                : waiting > 0
                  ? `${waiting} tugas menunggu keputusan Anda.`
                  : "Semua tenang. Beri tugas baru ke role, atau atur unit dan tim Anda."}
            </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/admin/tugas" className={buttonClasses("primary", "md")}>
                <Icon name="task" size={16} />
                Lihat tugas
              </Link>
              {waiting > 0 && (
                <Link href="/admin/persetujuan" className={buttonClasses("accent", "md")}>
                  <Icon name="approval" size={16} />
                  Putuskan ({waiting})
                </Link>
              )}
            </div>
          </div>
          <div className="hidden md:block -my-6 -mr-2">
            <BrandMascot width={240} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 stagger">
        {STATS.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            tone={stat.tone}
            loading={isLoading}
            icon={<Icon name={stat.icon} size={22} />}
          />
        ))}
      </div>

      {isError && (
        <Card>
          <EmptyState
            icon={<Icon name="dashboard" size={26} />}
            title="Ringkasan gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Aktivitas terbaru</CardTitle>
            <Link href="/admin/tugas" className="text-xs font-semibold text-brand hover:underline">
              Semua tugas →
            </Link>
          </CardHeader>
          {tasksLoading ? (
            <ul className="divide-y divide-line/70" aria-busy="true" aria-label="Memuat aktivitas">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex items-center gap-4 px-6 py-3.5 motion-safe:animate-pulse">
                  <div className="w-8 h-8 rounded-xl bg-brand-soft" />
                  <div className="flex-1 space-y-2">
                    <div className={`h-3.5 rounded-md bg-brand-soft ${i % 2 ? "w-1/2" : "w-2/3"}`} />
                    <div className="h-2.5 w-24 rounded-md bg-brand-soft/70" />
                  </div>
                  <div className="h-6 w-24 rounded-full bg-brand-soft/70" />
                </li>
              ))}
            </ul>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<Icon name="sparkles" size={26} />}
              title="Belum ada aktivitas"
              description="Setelah role diberi tugas, langkah kerja, hasil, dan pemeriksaan akan muncul di sini."
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/tugas/${t.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-surface/70 transition-colors">
                    <AgentStack agents={t.participants} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{t.title}</p>
                      <p className="text-[11px] text-faint">
                        {t.steps_done} langkah · {formatRupiah(t.cost_used)}
                      </p>
                    </div>
                    <TaskStatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <BudgetCard budget={budget} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <BusyAgents items={Summary?.busiest_agents} />
        <DailyCostChart days={Summary?.daily_costs} />
      </div>
    </div>
  );
}
