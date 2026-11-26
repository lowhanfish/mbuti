import Link from "next/link";
import React from "react";
import { BackgroundOrbs, BrandMark, BrandMascot } from "../../(admin)/_components/brand-mark";
import { ThemeToggle } from "../../(admin)/_components/theme-toggle";

const HIGHLIGHTS = ["Role bekerja dari SOP", "Hasil saling diperiksa", "Keputusan tetap di manusia"];

/** Kartu kecil yang mengambang di sekitar maskot: gambaran alur kerja kantor AI. */
const WORKING = [
  { initial: "R", name: "Rani", activity: "menyusun surat", color: "#a78bfa", status: "✍️", className: "-left-[6%] top-[12%]", delay: "0s" },
  { initial: "T", name: "Tegar", activity: "memeriksa hasil", color: "#fb923c", status: "🔍", className: "-right-[8%] top-[46%]", delay: "-1.6s" },
  { initial: "K", name: "Kepala", activity: "menunggu persetujuan", color: "#34d399", status: "✅", className: "left-0 bottom-[6%]", delay: "-3s" },
];

function WorkingChip({ item }: { item: (typeof WORKING)[number] }) {
  return (
    <div
      className={`auth-chip absolute z-10 flex items-center gap-2.5 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md pl-1.5 pr-3.5 py-1.5 shadow-[0_12px_30px_-12px_rgba(0,0,0,.6)] ${item.className}`}
      style={{ animationDelay: item.delay }}
    >
      <span
        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold text-night"
        style={{ background: item.color }}
      >
        {item.initial}
      </span>
      <span className="leading-tight">
        <span className="block text-[11px] font-bold">{item.name}</span>
        <span className="block text-[10px] text-white/65">{item.activity}</span>
      </span>
      <span className="text-sm" aria-hidden="true">
        {item.status}
      </span>
    </div>
  );
}

/** Kerangka halaman akun: panel merek di kiri (layar lebar) dan kartu formulir di kanan. */
export function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
  eyebrow,
}: {
  /** Lencana kecil di atas judul */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Kartu lebih lebar untuk formulir dua kolom (daftar). */
  wide?: boolean;
}) {
  return (
    <main className="flex-1 grid lg:grid-cols-[1.1fr_1fr]">
      <BackgroundOrbs />

      <section className="hidden lg:flex flex-col justify-between p-10 m-3 rounded-4xl bg-linear-to-br from-night via-night-2 to-[#3b2580] text-white relative overflow-hidden">
        <div className="absolute -left-20 top-1/3 w-80 h-80 rounded-full bg-brand/40 blur-3xl" aria-hidden="true" />
        <div className="absolute right-0 -bottom-20 w-96 h-96 rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
        <div className="auth-hex absolute inset-0" aria-hidden="true" />

        <Link href="/" className="flex items-center gap-3 relative">
          <BrandMark size={40} />
          <span className="text-lg font-extrabold tracking-wide">
            MBUTI<span className="text-accent">.</span>
          </span>
        </Link>

        <div className="relative flex-1 flex items-center justify-center my-6 min-h-[340px]" aria-hidden="true">
          <div className="relative w-[min(420px,100%)] aspect-square flex items-center justify-center">
            <div className="auth-halo absolute inset-[12%] rounded-full blur-2xl" />
            <div className="auth-ring absolute inset-[6%] rounded-full">
              <span className="-top-[5px] left-1/2" />
              <span className="bottom-[14%] -right-[5px] !w-2 !h-2 !bg-brand" />
            </div>
            <div className="animate-float relative">
              <BrandMascot width={330} />
            </div>
            {WORKING.map((item) => (
              <WorkingChip key={item.name} item={item} />
            ))}
          </div>
        </div>

        <div className="relative space-y-4 max-w-lg">
          <h2 className="text-3xl font-bold leading-tight text-balance">
            Kantor AI yang bekerja <span className="text-accent">dari SOP Anda.</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {HIGHLIGHTS.map((item) => (
              <span key={item} className="text-xs font-medium rounded-full bg-white/10 border border-white/15 px-3 py-1.5 backdrop-blur">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center p-4 pt-20 sm:p-8 sm:pt-24">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2">
          <Link
            href="/"
            className="h-10 px-3.5 rounded-2xl bg-surface/80 border border-rim text-xs font-semibold text-muted hover:text-brand flex items-center transition-colors"
          >
            ← Beranda
          </Link>
          <ThemeToggle />
        </div>
        <div className={`glass ring-gradient relative overflow-hidden w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-[28px] p-6 sm:p-8 space-y-6 rise`}>
          <div className="auth-card-top absolute inset-x-0 top-0 h-1" aria-hidden="true" />
          <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-accent/15 blur-2xl" aria-hidden="true" />
          <div className="space-y-2">
            <Link href="/" className="lg:hidden mb-4 inline-block" aria-label="Halaman depan MBUTI">
              <BrandMark size={52} />
            </Link>
            {eyebrow && <div className="relative">{eyebrow}</div>}
            <h1 className="relative text-3xl font-bold text-ink tracking-tight text-balance">{title}</h1>
            {subtitle && <p className="relative text-sm text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

/** Pesan di dalam kartu: galat, berhasil, atau info. */
export function Notice({ tone = "info", children }: { tone?: "error" | "success" | "info"; children: React.ReactNode }) {
  const classes = {
    error: "text-rose-700 bg-rose-50 border-rose-100",
    success: "text-emerald-800 bg-emerald-50 border-emerald-100",
    info: "text-ink bg-brand-soft/60 border-brand/15",
  }[tone];
  return (
    <div className={`text-sm border rounded-xl px-3 py-2 leading-relaxed rise ${classes}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** Tautan kecil di bawah formulir, mis. "Sudah punya akun? Masuk". */
export function FooterLink({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <p className="text-sm text-muted text-center">
      {text}{" "}
      <Link href={href} className="font-semibold text-brand hover:underline">
        {label}
      </Link>
    </p>
  );
}

/** Lencana kecil di atas judul halaman akun. `tone` brand untuk info, accent untuk sorotan. */
export function Eyebrow({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "brand" | "success" }) {
  const classes = {
    accent: "bg-accent-soft text-accent-strong",
    brand: "bg-brand-soft text-brand",
    success: "bg-emerald-50 text-emerald-700",
  }[tone];
  const dot = { accent: "bg-accent", brand: "bg-brand", success: "bg-emerald-500" }[tone];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full text-[11px] font-bold px-3 py-1 mb-1 tracking-wide ${classes}`}>
      <span className="relative flex w-2 h-2">
        <span className={`absolute inset-0 rounded-full animate-ping opacity-70 ${dot}`} />
        <span className={`relative w-2 h-2 rounded-full ${dot}`} />
      </span>
      {children}
    </span>
  );
}

/** Lambaian tangan untuk judul. */
export function Wave({ children = "👋" }: { children?: React.ReactNode }) {
  return <span className="inline-block origin-[70%_70%] motion-safe:animate-[wave_2.4s_ease-in-out_infinite]">{children}</span>;
}
