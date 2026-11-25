import Link from "next/link";
import { BrandMark } from "../(admin)/_components/brand-mark";

const POINTS = [
  {
    title: "Role dengan SOP sendiri",
    text: "Setiap role AI punya tujuan, instruksi, dan dokumen kerja. Hasilnya menunjuk halaman dokumen yang dipakai.",
  },
  {
    title: "Relasi yang bisa diatur",
    text: "Tentukan siapa menyerahkan ke siapa, siapa memeriksa, dan kapan manusia harus memutuskan.",
  },
  {
    title: "Kantor yang terlihat",
    text: "Pantau divisi dan role dalam tampilan kantor 3D: siapa sedang bekerja, menunggu, atau butuh bantuan.",
  },
];

export default function HomePage() {
  return (
    <div className="admin-shell min-h-screen flex flex-col">
      <header className="px-4 sm:px-8 py-5 flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <BrandMark size={34} />
          <span className="font-bold tracking-wide text-ink">MBUTI</span>
        </div>
        <Link
          href="/login"
          className="h-10 px-4 rounded-2xl bg-brand text-white text-sm font-semibold flex items-center hover:bg-brand-strong transition-colors"
        >
          Masuk
        </Link>
      </header>

      <main className="flex-1 px-4 sm:px-8 max-w-6xl w-full mx-auto py-12 sm:py-20 space-y-16">
        <section className="max-w-2xl space-y-5">
          <p className="text-xs font-semibold tracking-widest text-brand uppercase">
            Multi-agent Business &amp; Unified Task Intelligence
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-ink leading-tight text-balance">
            Bangun organisasi virtual berisi karyawan AI yang bekerja sesuai aturan Anda.
          </h1>
          <p className="text-lg text-muted leading-relaxed">
            Unggah SOP dan panduan kerja, susun role dan hubungan kerjanya, lalu biarkan mereka
            mengerjakan, memeriksa, dan meminta persetujuan Anda.
          </p>
          <Link
            href="/login"
            className="inline-flex h-12 px-6 rounded-2xl bg-brand text-white font-semibold items-center hover:bg-brand-strong transition-colors shadow-[0_8px_20px_rgba(76,91,212,.3)]"
          >
            Mulai sekarang
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {POINTS.map((point) => (
            <div key={point.title} className="glass rounded-3xl p-6 space-y-2">
              <h2 className="font-bold text-ink">{point.title}</h2>
              <p className="text-sm text-muted leading-relaxed">{point.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="px-4 sm:px-8 py-6 text-xs text-faint max-w-6xl w-full mx-auto">
        © 2026 MBUTI
      </footer>
    </div>
  );
}
