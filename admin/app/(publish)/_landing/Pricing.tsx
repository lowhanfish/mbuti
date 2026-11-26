"use client";

import Link from "next/link";
import React, { useState } from "react";
import { buttonClasses } from "../../(admin)/_components/ui/button-classes";
import Heading from "./Heading";
import Spotlight from "./Spotlight";

/*
 * HARGA RENCANA: angka di bawah adalah usulan, belum diputuskan, dan pembayaran belum ada.
 * Ubah di sini. Hapus label "harga rencana" hanya setelah paket benar-benar berlaku.
 */
const PLANS = [
  {
    name: "Perintis",
    pitch: "Untuk mencoba satu alur kerja.",
    monthly: 0,
    yearly: 0,
    featured: false,
    features: ["3 role AI", "30 tugas per bulan", "20 dokumen", "Rujukan halaman dan persetujuan", "Kantor 3D"],
  },
  {
    name: "Tim",
    pitch: "Untuk satu bidang atau unit kerja.",
    monthly: 299_000,
    yearly: 249_000,
    featured: true,
    features: ["15 role AI", "500 tugas per bulan", "500 dokumen", "Relasi bersyarat dan jalur penolakan", "Batas biaya per tugas"],
  },
  {
    name: "Instansi",
    pitch: "Untuk organisasi dengan banyak unit.",
    monthly: 1_490_000,
    yearly: 1_240_000,
    featured: false,
    features: ["Role AI tanpa batas", "Kuota tugas sesuai kebutuhan", "Dokumen sesuai kebutuhan", "Pendampingan menyusun role", "Pemasangan di server sendiri"],
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
        text="Biaya model AI mengikuti pemakaian dan selalu terlihat di dasbor, lengkap dengan batas yang Anda tentukan."
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
              {value ? "Tahunan · hemat 2 bulan" : "Bulanan"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {PLANS.map((plan) => {
          const price = yearly ? plan.yearly : plan.monthly;
          return (
            <div key={plan.name} className={`lp-reveal flex ${plan.featured ? "lg:-my-4" : ""}`}>
              <Spotlight className={`flex-1 flex flex-col gap-6 p-7 sm:p-8 ${plan.featured ? "lp-featured" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-extrabold text-white">{plan.name}</h3>
                  {plan.featured && <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-ink">Paling pas</span>}
                </div>
                <p className="text-sm text-white/60">{plan.pitch}</p>
                <div>
                  <p key={price} className="rise text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
                    {rupiah(price)}
                  </p>
                  <p className="mt-1 text-xs text-white/50">{price === 0 ? "selamanya" : yearly ? "per bulan, dibayar tahunan" : "per bulan"}</p>
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
    </section>
  );
}
