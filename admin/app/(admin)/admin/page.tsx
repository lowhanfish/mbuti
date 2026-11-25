"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard } from "../_components/ui";
import { buttonClasses } from "../_components/ui/button-classes";
import { Icon } from "../_components/admin-icons";
import { BrandMascot } from "../_components/brand-mark";
import { useResponseListRole } from "./role/hooks/crud";
import { AgentStack, TaskStatusBadge } from "./tugas/components/TaskParts";
import { useResponseListTask } from "./tugas/hooks/crud";
import { formatRupiah } from "./tugas/types";

const FIRST_STEPS = [
  { title: "Susun unit / divisi", href: "/admin/organisasi/unit", stage: "A1", ready: true },
  { title: "Undang anggota tim", href: "/admin/organisasi/pengguna", stage: "A1", ready: true },
  { title: "Buat role pertama", href: "/admin/role", stage: "A2", ready: true },
  { title: "Unggah SOP untuk role", href: "/admin/pengetahuan", stage: "A3", ready: true },
  { title: "Hubungkan role di peta relasi", href: "/admin/relasi", stage: "A4", ready: true },
  { title: "Beri tugas pertama", href: "/admin/tugas", stage: "A5", ready: true },
  { title: "Lihat kantor 3D", href: "/admin/kantor", stage: "A6", ready: false },
];

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
  const { List: Tasks } = useResponseListTask({});
  const { List: Roles } = useResponseListRole({ search: "", unit_id: "", status: "" });
  const s = Tasks?.summary;
  const running = s ? s.queued + s.running : 0;
  const waiting = s?.waiting_approval ?? 0;
  const cost = (Tasks?.data ?? []).reduce((sum, t) => sum + t.cost_used, 0);
  const recent = (Tasks?.data ?? []).slice(0, 5);
  const STATS = [
    { label: "Tugas berjalan", value: running, icon: "task", hint: `${s?.completed ?? 0} selesai`, tone: "brand" },
    { label: "Menunggu persetujuan", value: waiting, icon: "approval", hint: waiting ? "Perlu keputusan Anda" : "Tidak ada antrean", tone: "accent" },
    { label: "Role aktif", value: Roles?.summary.active ?? 0, icon: "agent", hint: `${Roles?.summary.draft ?? 0} draf · ${Roles?.summary.paused ?? 0} dijeda`, tone: "pink" },
    { label: "Biaya tugas", value: formatRupiah(cost), icon: "wallet", hint: "Simulasi data contoh", tone: "teal" },
  ] as const;

  return (
    <div className="space-y-6">
      <Card glow className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-soft/80 via-white/40 to-accent-soft/80" aria-hidden="true" />
        <div className="relative grid md:grid-cols-[1fr_auto] items-center gap-4 p-6 sm:p-8">
          <div className="space-y-3">
            <Badge variant="dark" dot>
              {user?.organization?.name ?? "Organisasi"}
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {hello}, <span className="text-gradient">{user?.full_name?.split(" ")[0] ?? "Tim"}</span>!
            </h2>
            <p className="text-sm text-muted max-w-lg leading-relaxed">
              {running > 0
                ? `${running} tugas sedang dikerjakan role AI${waiting ? ` dan ${waiting} menunggu keputusan Anda` : ""}.`
                : waiting > 0
                  ? `${waiting} tugas menunggu keputusan Anda.`
                  : "Semua tenang. Beri tugas baru ke role, atau atur unit dan tim Anda."}
            </p>
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
            icon={<Icon name={stat.icon} size={22} />}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Aktivitas terbaru</CardTitle>
          </CardHeader>
          {recent.length === 0 ? (
            <EmptyState
              icon={<Icon name="sparkles" size={26} />}
              title="Belum ada aktivitas"
              description="Setelah role diberi tugas, langkah kerja, hasil, dan pemeriksaan akan muncul di sini."
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/tugas/${t.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/70 transition-colors">
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

        <Card>
          <CardHeader>
            <CardTitle>Langkah awal</CardTitle>
            <Badge variant="info" size="sm">
              {FIRST_STEPS.filter((x) => x.ready).length} / {FIRST_STEPS.length} siap
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {FIRST_STEPS.map((step, index) => (
              <Link
                key={step.href}
                href={step.href}
                className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white transition-all"
              >
                <span
                  className={`w-7 h-7 rounded-xl text-xs font-bold flex items-center justify-center transition-transform group-hover:scale-110 ${
                    step.ready ? "bg-gradient-to-br from-brand to-[#9b6bff] text-white" : "bg-white text-faint border border-line"
                  }`}
                >
                  {index + 1}
                </span>
                <span className={`flex-1 text-sm ${step.ready ? "text-ink font-medium" : "text-muted"}`}>{step.title}</span>
                <Badge size="sm" variant={step.ready ? "success" : "neutral"}>
                  {step.ready ? "Siap" : step.stage}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
