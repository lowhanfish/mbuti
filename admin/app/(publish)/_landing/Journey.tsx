"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandMascot } from "../../(admin)/_components/brand-mark";
import { buttonClasses } from "../../(admin)/_components/ui/button-classes";

const Poster = () => (
  <div className="absolute inset-0 flex items-start justify-center pt-24 lg:items-center lg:justify-end lg:pt-0 lg:pr-[8vw]">
    <BrandMascot width={520} className="w-3/4 max-w-lg h-auto" />
  </div>
);

/** Three.js baru diunduh setelah halaman tampil; selama itu maskot yang terlihat. */
const HiveScene = dynamic(() => import("./HiveScene"), { ssr: false, loading: Poster });

/** Bila WebGL tidak tersedia atau adegan gagal, halaman tetap utuh dengan gambar maskot. */
class SceneGuard extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Poster /> : this.props.children;
  }
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const useReducedMotion = () =>
  useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(REDUCED);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false
  );

const STEPS = [
  {
    tag: "Pengetahuan",
    title: "SOP Anda jadi pegangan",
    text: "Unggah PDF, DOCX, TXT, atau Markdown. Isinya dipecah per halaman dan menjadi sumber aturan bagi role.",
    note: "Setiap potongan ingat dokumen, versi, dan halamannya.",
    color: "#38bdf8",
  },
  {
    tag: "Penyusunan",
    title: "Satu role menyusun",
    text: "Ia membaca potongan yang relevan, menulis hasilnya, lalu mencantumkan rujukan. Kalau aturannya tidak ada, ia mengatakannya.",
    note: "Rujukan bisa diklik sampai ke halaman asalnya.",
    color: "#9b6bff",
  },
  {
    tag: "Pemeriksaan",
    title: "Role lain menguji",
    text: "Pemeriksa menilai hasil dengan kriteria yang Anda tulis. Kalau kurang, hasil kembali beserta catatan perbaikan.",
    note: "Putaran revisi dibatasi agar tidak berputar tanpa henti.",
    color: "#ffb81c",
  },
  {
    tag: "Keputusan",
    title: "Anda yang mengetuk palu",
    text: "Tugas berhenti di meja Anda pada titik yang Anda tentukan: setujui, minta revisi, atau tolak.",
    note: "Role tidak mengirim apa pun ke luar sistem.",
    color: "#ec4899",
  },
];

const PROMISES = ["Hasil menyebut halaman dokumen", "Keputusan tetap di manusia", "Biaya per tugas dibatasi"];

/** Pembuka dan alur empat langkah di atas adegan 3D selayar penuh yang mengikuti guliran. */
export default function Journey() {
  const root = useRef<HTMLDivElement>(null);
  const blocks = useRef<(HTMLElement | null)[]>([]);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Di layar sempit kartu berada di bawah adegan, jadi garis acuannya lebih rendah
      const line = window.innerHeight * (window.innerWidth >= 1024 ? 0.55 : 0.82);
      let current = 0;
      blocks.current.forEach((block, i) => {
        if (block && block.getBoundingClientRect().top <= line) current = i + 1;
      });
      setStep(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  // Berhenti menggambar saat bagian ini tidak terlihat
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback((station: number) => {
    blocks.current[station]?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div ref={root} className="relative text-white">
      <div className="sticky top-0 h-svh w-full overflow-hidden">
        <div className="absolute inset-0" role="img" aria-label="Ilustrasi 3D: lebah robot mengantar dokumen dari SOP ke penyusun, pemeriksa, lalu manusia yang memutuskan.">
          <SceneGuard>
            <HiveScene step={step} animate={!reduced} running={visible} onSelect={goTo} />
          </SceneGuard>
        </div>
        {/* Peredup agar teks selalu terbaca di atas adegan */}
        <div className="lp-scrim pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-2" aria-label="Langkah alur" role="group">
          {STEPS.map((item, i) => (
            <button
              key={item.tag}
              type="button"
              onClick={() => goTo(i)}
              aria-label={item.title}
              aria-current={step === i + 1 ? "step" : undefined}
              className={`w-2.5 rounded-full transition-all duration-500 cursor-pointer ${step === i + 1 ? "h-9" : "h-2.5 bg-white/30 hover:bg-white/60"}`}
              style={step === i + 1 ? { background: item.color, boxShadow: `0 0 16px ${item.color}` } : undefined}
            />
          ))}
        </div>
        <p className="pointer-events-none absolute right-5 bottom-4 hidden lg:block text-[11px] text-white/45">
          Seret untuk memutar · klik lebah atau meja kerja
        </p>
      </div>

      {/* Lapisan teks: ruang kosongnya meneruskan klik ke adegan */}
      <div className="pointer-events-none relative z-10 -mt-[100svh] mx-auto max-w-7xl px-5 sm:px-10">
        <section className="min-h-svh flex flex-col justify-end lg:justify-center pb-10 lg:pb-0">
          <div className="pointer-events-auto flex flex-col gap-4 lg:gap-7 lg:max-w-[37rem] stagger">
            <span className="self-start inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-[#d9ccff] backdrop-blur">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-70" />
                <span className="relative w-2 h-2 rounded-full bg-accent" />
              </span>
              Multi-agent Business &amp; Unified Task Intelligence
            </span>
            <h1 className="text-[2.6rem] leading-[1.04] sm:text-6xl xl:text-[4.25rem] font-extrabold tracking-tight text-balance">
              Rekrut tim AI yang <span className="lp-shimmer">bekerja dari SOP Anda.</span>
            </h1>
            <p className="text-base sm:text-lg text-white/75 leading-relaxed lg:max-w-[32rem]">
              Satu menyusun, satu memeriksa, dan semuanya berhenti menunggu keputusan Anda. Kantor virtual dengan alur kerja yang Anda gambar sendiri.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className={`${buttonClasses("accent", "lg")} lp-shine`}>
                Masuk ke kantor AI
              </Link>
              <a href="#alur" className="lp-ghost inline-flex items-center justify-center h-12 px-6 rounded-2xl font-semibold">
                Ikuti satu tugas ↓
              </a>
            </div>
            <ul className="hidden sm:flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60">
              {PROMISES.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <span className="text-accent" aria-hidden="true">
                    ⬢
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div id="alur">
          {STEPS.map((item, i) => (
            <section
              key={item.title}
              ref={(node) => {
                blocks.current[i] = node;
              }}
              className="min-h-svh flex items-end lg:items-center pb-8 lg:pb-0"
            >
              <article
                className={`pointer-events-auto w-full lg:max-w-[28rem] rounded-[28px] border p-6 sm:p-8 backdrop-blur-xl transition-all duration-700 ${
                  step === i + 1 ? "border-white/20 bg-[#1b1334]/70 opacity-100 translate-x-0" : "border-white/5 bg-[#1b1334]/40 opacity-40 lg:-translate-x-6"
                }`}
                style={step === i + 1 ? { boxShadow: `0 0 0 1px ${item.color}55, 0 40px 90px -35px ${item.color}` } : undefined}
              >
                <div className="flex items-center gap-3">
                  <span className="lp-hex w-12 h-12 flex items-center justify-center text-lg font-extrabold text-ink" style={{ background: item.color }}>
                    {i + 1}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: item.color }}>
                    {item.tag}
                  </span>
                </div>
                <h2 className="mt-4 text-2xl sm:text-4xl font-extrabold tracking-tight">{item.title}</h2>
                <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed">{item.text}</p>
                <p className="mt-4 text-xs text-white/55 border-t border-white/10 pt-3">{item.note}</p>
              </article>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
