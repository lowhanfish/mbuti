import Link from "next/link";
import { BackgroundOrbs, BrandMark, BrandMascot } from "../(admin)/_components/brand-mark";
import { buttonClasses } from "../(admin)/_components/ui/button-classes";

const POINTS = [
  {
    emoji: "📘",
    title: "Role dengan SOP sendiri",
    text: "Setiap role AI punya tujuan, instruksi, dan dokumen kerja. Hasilnya menunjuk halaman dokumen yang dipakai.",
  },
  {
    emoji: "🔗",
    title: "Relasi yang bisa diatur",
    text: "Tentukan siapa menyerahkan ke siapa, siapa memeriksa, dan kapan manusia harus memutuskan.",
  },
  {
    emoji: "🏢",
    title: "Kantor yang terlihat",
    text: "Pantau divisi dan role dalam kantor 3D: siapa sedang bekerja, menunggu, atau butuh bantuan.",
  },
];

export default function HomePage() {
  return (
    <div className="admin-shell min-h-screen flex flex-col">
      <BackgroundOrbs />

      <header className="px-4 sm:px-8 py-5 flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <span className="font-extrabold tracking-wide text-ink text-lg">
            MBUTI<span className="text-accent-strong">.</span>
          </span>
        </div>
        <Link href="/login" className={buttonClasses("dark", "md")}>
          Masuk
        </Link>
      </header>

      <main className="flex-1 px-4 sm:px-8 max-w-6xl w-full mx-auto py-10 sm:py-16 space-y-16">
        <section className="grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center">
          <div className="space-y-6 stagger">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-line px-3 py-1.5 text-xs font-semibold text-brand shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Multi-agent Business &amp; Unified Task Intelligence
            </span>
            <h1 className="text-4xl sm:text-6xl font-extrabold text-ink leading-[1.05] tracking-tight text-balance">
              Organisasi virtual dengan <span className="text-gradient">karyawan AI</span> yang patuh SOP.
            </h1>
            <p className="text-lg text-muted leading-relaxed max-w-xl">
              Unggah SOP dan panduan kerja, susun role dan hubungan kerjanya, lalu biarkan mereka mengerjakan, saling
              memeriksa, dan meminta persetujuan Anda.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className={buttonClasses("primary", "lg")}>
                Mulai sekarang
              </Link>
              <a href="#fitur" className={buttonClasses("outline", "lg")}>
                Lihat cara kerja
              </a>
            </div>
          </div>
          <div className="relative flex justify-center">
            <div className="absolute inset-10 rounded-full bg-gradient-to-br from-brand/30 to-accent/30 blur-3xl" aria-hidden="true" />
            <BrandMascot width={460} className="relative" />
          </div>
        </section>

        <section id="fitur" className="grid gap-4 sm:grid-cols-3 stagger">
          {POINTS.map((point) => (
            <div key={point.title} className="glass card-hover rounded-[28px] p-6 space-y-3">
              <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-soft to-accent-soft flex items-center justify-center text-2xl">
                {point.emoji}
              </span>
              <h2 className="font-bold text-ink">{point.title}</h2>
              <p className="text-sm text-muted leading-relaxed">{point.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="px-4 sm:px-8 py-6 text-xs text-faint max-w-6xl w-full mx-auto">© 2026 MBUTI</footer>
    </div>
  );
}
