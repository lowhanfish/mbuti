"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard } from "../_components/ui";
import { buttonClasses } from "../_components/ui/button-classes";
import { Icon } from "../_components/admin-icons";
import { BrandMascot } from "../_components/brand-mark";

const STATS = [
  { label: "Tugas berjalan", value: 0, icon: "task", hint: "Belum ada tugas", tone: "brand" },
  { label: "Menunggu persetujuan", value: 0, icon: "approval", hint: "Tidak ada antrean", tone: "accent" },
  { label: "Role aktif", value: 0, icon: "agent", hint: "Belum ada role", tone: "pink" },
  { label: "Biaya bulan ini", value: "Rp 0", icon: "wallet", hint: "Belum ada pemakaian", tone: "teal" },
] as const;

const FIRST_STEPS = [
  { title: "Susun unit / divisi", href: "/admin/organisasi/unit", stage: "A1", ready: true },
  { title: "Undang anggota tim", href: "/admin/organisasi/pengguna", stage: "A1", ready: true },
  { title: "Buat role pertama", href: "/admin/role", stage: "A2", ready: false },
  { title: "Unggah SOP untuk role", href: "/admin/pengetahuan", stage: "A3", ready: false },
  { title: "Hubungkan role di peta relasi", href: "/admin/relasi", stage: "A4", ready: false },
  { title: "Beri tugas pertama", href: "/admin/tugas", stage: "A5", ready: false },
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
              Kantor AI Anda masih kosong. Mulai dengan menyusun unit dan mengundang tim, lalu buat role pertama yang
              bekerja dari SOP.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/admin/organisasi/unit" className={buttonClasses("primary", "md")}>
                <Icon name="building" size={16} />
                Susun unit
              </Link>
              <Link href="/admin/organisasi/pengguna" className={buttonClasses("outline", "md")}>
                <Icon name="users" size={16} />
                Undang tim
              </Link>
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
          <EmptyState
            icon={<Icon name="sparkles" size={26} />}
            title="Belum ada aktivitas"
            description="Setelah role diberi tugas, langkah kerja, hasil, dan pemeriksaan akan muncul di sini."
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Langkah awal</CardTitle>
            <Badge variant="info" size="sm">
              2 / 6 siap
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
