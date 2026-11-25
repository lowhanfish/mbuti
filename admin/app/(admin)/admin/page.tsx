"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from "../_components/ui";
import { Icon } from "../_components/admin-icons";

const STATS = [
  { label: "Tugas berjalan", value: 0, icon: "task", hint: "Belum ada tugas" },
  { label: "Menunggu persetujuan", value: 0, icon: "approval", hint: "Tidak ada antrean" },
  { label: "Role aktif", value: 0, icon: "agent", hint: "Belum ada role" },
  { label: "Biaya bulan ini", value: "Rp 0", icon: "wallet", hint: "Belum ada pemakaian" },
];

const FIRST_STEPS = [
  { title: "Susun unit / divisi", href: "/admin/organisasi/unit", stage: "A1" },
  { title: "Buat role pertama", href: "/admin/role", stage: "A2" },
  { title: "Unggah SOP untuk role", href: "/admin/pengetahuan", stage: "A3" },
  { title: "Hubungkan role di peta relasi", href: "/admin/relasi", stage: "A4" },
  { title: "Beri tugas pertama", href: "/admin/tugas", stage: "A5" },
];

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Halo, ${user?.full_name ?? "Pengguna"}`}
        description={`Ringkasan kerja ${user?.organization?.name ?? "organisasi Anda"}.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-muted">{stat.label}</p>
                <p className="text-2xl font-bold text-ink tabular-nums">{stat.value}</p>
                <p className="text-[11px] text-faint">{stat.hint}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <Icon name={stat.icon} size={22} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Aktivitas terbaru</CardTitle>
          </CardHeader>
          <EmptyState
            icon={<Icon name="sparkles" size={26} />}
            title="Belum ada aktivitas"
            description="Setelah role diberi tugas, langkah kerja, hasil, dan pemeriksaan akan muncul di sini."
            action={
              <Link
                href="/admin/tugas"
                className="inline-flex items-center gap-2 h-10 px-4 rounded-2xl border border-line bg-white/70 text-sm font-semibold text-ink hover:bg-white transition-colors"
              >
                <Icon name="plus" size={16} />
                Buat tugas
              </Link>
            }
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Langkah awal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {FIRST_STEPS.map((step, index) => (
              <Link
                key={step.href}
                href={step.href}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/70 transition-colors"
              >
                <span className="w-7 h-7 rounded-xl bg-white text-brand text-xs font-bold flex items-center justify-center border border-line">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm text-ink">{step.title}</span>
                <Badge size="sm">{step.stage}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
