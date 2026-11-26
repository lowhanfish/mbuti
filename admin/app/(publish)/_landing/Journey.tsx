"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { Component, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandMascot } from "../../(admin)/_components/brand-mark";
import { buttonClasses } from "../../(admin)/_components/ui/button-classes";

const Poster = () => (
  <div className="absolute inset-0 flex items-center justify-center">
    <BrandMascot width={420} className="w-3/4 max-w-md h-auto" />
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
    title: "Mulai dari SOP Anda",
    text: "Unggah PDF, DOCX, TXT, atau Markdown. Isinya dipecah per halaman dan menjadi sumber aturan bagi role.",
    note: "Setiap potongan ingat dokumen, versi, dan halamannya.",
    color: "#38bdf8",
  },
  {
    tag: "Penyusunan",
    title: "Role menyusun hasil",
    text: "Role membaca potongan yang relevan, menulis hasilnya, dan mencantumkan rujukan. Bila aturannya tidak ada, ia mengatakannya.",
    note: "Rujukan bisa diklik sampai ke halaman asalnya.",
    color: "#9b6bff",
  },
  {
    tag: "Pemeriksaan",
    title: "Role lain memeriksa",
    text: "Pemeriksa menilai hasil terhadap kriteria yang Anda tulis. Kalau kurang, hasil kembali dengan catatan untuk diperbaiki.",
    note: "Putaran revisi dibatasi agar tidak berputar tanpa henti.",
    color: "#ffb81c",
  },
  {
    tag: "Keputusan",
    title: "Anda yang memutuskan",
    text: "Tugas berhenti di meja Anda di titik yang Anda tentukan: setujui, minta revisi, atau tolak.",
    note: "Role tidak mengirim apa pun ke luar sistem.",
    color: "#ec4899",
  },
];

const PROMISES = ["Hasil menyebut halaman dokumen", "Keputusan tetap di manusia", "Biaya per tugas dibatasi"];

/** Pembuka dan alur empat langkah: teks di kiri, adegan 3D yang menempel dan mengikuti guliran. */
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
      // Di layar sempit adegan menutupi bagian atas, jadi garis acuannya lebih rendah
      const line = window.innerHeight * (window.innerWidth >= 1024 ? 0.55 : 0.78);
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

  return (
    <div ref={root} className="lp-night relative flex flex-col lg:flex-row-reverse text-white">
      <div className="lp-dock sticky top-0 z-10 h-[52svh] lg:h-svh lg:w-[58%] lg:self-start">
        <div className="lp-stage absolute inset-0 lg:-left-28" role="img" aria-label="Ilustrasi 3D: lebah robot mengantar dokumen dari SOP ke penyusun, pemeriksa, lalu manusia yang memutuskan.">
          <div className="lp-fade absolute inset-0">
            <SceneGuard>
              <HiveScene step={step} animate={!reduced} running={visible} />
            </SceneGuard>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-3 lg:bottom-8 flex flex-col items-center gap-2">
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, ...STEPS.map((_, i) => i + 1)].map((i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step === i ? "w-8 bg-accent" : "w-1.5 bg-white/30"}`} />
            ))}
          </div>
          <span className="text-[10px] text-white/40">Ilustrasi alur kerja</span>
        </div>
      </div>

      <div className="relative lg:z-20 lg:w-[42%] px-5 sm:px-10 lg:pl-[max(2.5rem,calc((100vw-80rem)/2))] lg:pr-2">
        <section className="min-h-[48svh] lg:min-h-svh flex flex-col justify-center gap-5 lg:gap-7 py-8 lg:py-28 stagger">
          <span className="self-start inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-[#d9ccff] backdrop-blur">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-70" />
              <span className="relative w-2 h-2 rounded-full bg-accent" />
            </span>
            Multi-agent Business &amp; Unified Task Intelligence
          </span>
          <h1 className="text-4xl sm:text-6xl xl:text-7xl font-extrabold leading-[1.04] tracking-tight text-balance">
            Tim AI yang bekerja dari <span className="lp-shimmer">SOP Anda.</span>
          </h1>
          <p className="text-base sm:text-lg text-white/70 leading-relaxed max-w-xl">
            Susun role seperti menyusun tim. Mereka mengerjakan, saling memeriksa, dan berhenti untuk meminta keputusan Anda.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className={`${buttonClasses("accent", "lg")} lp-shine`}>
              Masuk ke kantor AI
            </Link>
            <a href="#alur" className="inline-flex items-center justify-center h-12 px-6 rounded-2xl border border-white/20 bg-white/5 font-semibold text-white backdrop-blur transition-all hover:bg-white/15 hover:-translate-y-px">
              Lihat cara kerja
            </a>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60">
            {PROMISES.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span className="text-accent" aria-hidden="true">
                  ⬢
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div id="alur" className="scroll-mt-[52svh] lg:scroll-mt-0">
          {STEPS.map((item, i) => (
            <section
              key={item.title}
              ref={(node) => {
                blocks.current[i] = node;
              }}
              className="min-h-[48svh] lg:min-h-[85svh] flex items-center py-6"
            >
              <article
                className={`w-full rounded-[28px] border p-6 sm:p-8 backdrop-blur-md transition-all duration-500 ${
                  step === i + 1 ? "border-white/20 bg-white/10 opacity-100 translate-x-0" : "border-white/5 bg-white/[0.03] opacity-45 lg:-translate-x-3"
                }`}
                style={step === i + 1 ? { boxShadow: `0 30px 70px -30px ${item.color}` } : undefined}
              >
                <div className="flex items-center gap-3">
                  <span className="lp-hex w-12 h-12 flex items-center justify-center text-lg font-extrabold text-ink" style={{ background: item.color }}>
                    {i + 1}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: item.color }}>
                    {item.tag}
                  </span>
                </div>
                <h2 className="mt-4 text-2xl sm:text-4xl font-extrabold tracking-tight">{item.title}</h2>
                <p className="mt-3 text-sm sm:text-base text-white/70 leading-relaxed">{item.text}</p>
                <p className="mt-4 text-xs text-white/50 border-t border-white/10 pt-3">{item.note}</p>
              </article>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
