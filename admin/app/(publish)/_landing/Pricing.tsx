"use client";

import Link from "next/link";
import React, { useState } from "react";
import { buttonClasses } from "../../(admin)/_components/ui/button-classes";
import Heading from "./Heading";
import Spotlight from "./Spotlight";

/*
 * HARGA RENCANA: mengikuti rancangan D2 di PLANNING.md. Batas paket dan pembayaran belum ada di aplikasi,
 * jadi hapus label "harga rencana" hanya setelah paket benar-benar berlaku. Harga belum termasuk PPN.
 */
const PLANS: {
  name: string;
  pitch: string;
  monthly: number;
  /** Per bulan bila dibayar tahunan; null berarti belum ada harga tahunan */
  yearly: number | null;
  /** Biaya pasang sekali bayar */
  setup: number;
  featured: boolean;
  features: string[];
}[] = [
  {
    name: "Uji coba",
    pitch: "Untuk mencoba satu alur kerja.",
    monthly: 0,
    yearly: 0,
    setup: 0,
    featured: false,
    features: ["3 role AI", "30 tugas", "Rujukan halaman dan persetujuan", "Kantor 3D"],
  },
  {
    name: "Unit",
    pitch: "Untuk satu tim, cabang, atau kecamatan.",
    monthly: 599_000,
    yearly: null,
    setup: 750_000,
    featured: true,
    features: ["10 role AI", "Kredit model AI Rp100.000 per bulan", "Pendampingan 1 jam per bulan", "Surat, laporan, dan spreadsheet", "Tugas rutin dan persetujuan"],
  },
  {
    name: "Instansi",
    pitch: "Untuk satu instansi, dinas, atau perusahaan.",
    monthly: 1_490_000,
    yearly: 1_240_000,
    setup: 2_500_000,
    featured: false,
    features: ["25 role AI", "Kredit model AI Rp300.000 per bulan", "Pendampingan 2 jam per bulan", "Semua kemampuan paket Unit"],
  },
];

const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

export default function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="harga" className="scroll-mt-24 max-w-7xl w-full mx-auto px-5 sm:px-10 py-20 sm:py-28 space-y-10">
      <Heading
        center
        tag="Harga"
        title="Mulai kecil, tambah role saat perlu"
        text="Paket berbayar sudah memuat kredit model AI. Pemakaiannya selalu terlihat di dasbor, lengkap dengan batas yang Anda tentukan."
      />

      <div className="lp-reveal flex flex-col items-center gap-4">
        <p className="rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold text-[#ffd98a] text-center">
          Harga rencana, belum berlaku. Pendaftaran dan pembayaran belum tersedia.
        </p>
        <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-sm font-semibold" role="group" aria-label="Periode pembayaran">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={yearly === value}
              onClick={() => setYearly(value)}
              className={`rounded-full px-5 py-2 transition-all duration-300 cursor-pointer ${yearly === value ? "bg-accent text-ink shadow-[0_8px_24px_-8px_rgba(255,184,28,.8)]" : "text-white/65 hover:text-white"}`}
            >
              {value ? "Tahunan" : "Bulanan"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {PLANS.map((plan) => {
          const annual = yearly && plan.yearly !== null;
          const price = annual ? (plan.yearly as number) : plan.monthly;
          const period = price === 0 ? "selama 14 hari" : annual ? "per bulan, dibayar tahunan" : "per bulan";
          return (
            <div key={plan.name} className={`lp-reveal flex ${plan.featured ? "lg:-my-4" : ""}`}>
              <Spotlight className={`flex-1 flex flex-col gap-6 p-7 sm:p-8 ${plan.featured ? "lp-featured" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-extrabold text-white">{plan.name}</h3>
                  {plan.featured && <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-ink">Paling pas</span>}
                </div>
                <p className="text-sm text-white/60">{plan.pitch}</p>
                <div>
                  <p key={price} className="rise text-4xl sm:text-5xl lg:text-4xl xl:text-5xl font-extrabold tracking-tight text-white">
                    {rupiah(price)}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {period}
                    {yearly && plan.yearly === null && " · harga tahunan belum ada"}
                  </p>
                  <p className="mt-1 text-xs text-white/50">{plan.setup ? `Biaya pasang sekali ${rupiah(plan.setup)}` : "Tanpa biaya pasang"}</p>
                </div>
                <ul className="flex-1 space-y-2.5 border-t border-white/10 pt-5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-white/75">
                      <span className="mt-1 lp-hex w-3 h-3 shrink-0 bg-accent" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.monthly === 0 ? (
                  <Link href="/login" className="lp-ghost inline-flex items-center justify-center h-12 rounded-2xl font-semibold">
                    Masuk
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={plan.featured ? `${buttonClasses("accent", "lg")} cursor-default! opacity-80` : "inline-flex items-center justify-center h-12 rounded-2xl border border-white/10 font-semibold text-white/45"}
                  >
                    Segera tersedia
                  </span>
                )}
              </Spotlight>
            </div>
          );
        })}
      </div>

      <p className="lp-reveal mx-auto max-w-2xl text-center text-xs leading-relaxed text-white/55">
        Satu langganan untuk satu unit kerja. Tambah 10 role Rp400.000 per bulan, termasuk kredit model AI Rp100.000. Harga belum termasuk PPN.
      </p>
    </section>
  );
}
