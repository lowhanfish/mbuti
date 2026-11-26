import Link from "next/link";
import React from "react";
import { BackgroundOrbs, BrandMark, BrandMascot } from "../../(admin)/_components/brand-mark";
import { ThemeToggle } from "../../(admin)/_components/theme-toggle";

const HIGHLIGHTS = ["Role bekerja dari SOP", "Hasil saling diperiksa", "Keputusan tetap di manusia"];

/** Kerangka halaman akun: panel merek di kiri (layar lebar) dan kartu formulir di kanan. */
export function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
}: {
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

        <Link href="/" className="flex items-center gap-3 relative">
          <BrandMark size={40} />
          <span className="text-lg font-extrabold tracking-wide">
            MBUTI<span className="text-accent">.</span>
          </span>
        </Link>

        <div className="relative flex justify-center">
          <BrandMascot width={400} />
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

      <section className="relative flex items-center justify-center p-4 pt-20 sm:p-8 sm:pt-20 lg:pt-8">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2">
          <Link
            href="/"
            className="h-10 px-3.5 rounded-2xl bg-surface/80 border border-rim text-xs font-semibold text-muted hover:text-brand flex items-center transition-colors"
          >
            ← Beranda
          </Link>
          <ThemeToggle />
        </div>
        <div className={`glass ring-gradient w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-[28px] p-6 sm:p-8 space-y-6 rise`}>
          <div className="space-y-2">
            <Link href="/" className="lg:hidden mb-4 inline-block" aria-label="Halaman depan MBUTI">
              <BrandMark size={52} />
            </Link>
            <h1 className="text-3xl font-bold text-ink tracking-tight text-balance">{title}</h1>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
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
