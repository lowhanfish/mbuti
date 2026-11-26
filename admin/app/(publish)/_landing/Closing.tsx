import Link from "next/link";
import React from "react";
import { BrandMascot } from "../../(admin)/_components/brand-mark";
import { buttonClasses } from "../../(admin)/_components/ui/button-classes";

const USES = [
  "Surat dinas",
  "Pemeriksaan dokumen",
  "Layanan informasi",
  "Rangkuman laporan",
  "Verifikasi berkas",
  "Panduan kerja unit",
  "Notula rapat",
  "Telaah staf",
];

/** Pita contoh pekerjaan yang berjalan terus. */
export function UseCases() {
  return (
    <div className="lp-marquee relative overflow-hidden bg-gradient-to-r from-accent via-[#ffc93c] to-accent-strong py-4 -rotate-1 scale-[1.02]">
      <p className="sr-only">Contoh pekerjaan: {USES.join(", ")}.</p>
      <div className="lp-track flex w-max" aria-hidden="true">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0">
            {USES.map((use) => (
              <li key={use} className="flex items-center gap-6 pr-6 text-lg sm:text-2xl font-extrabold text-ink whitespace-nowrap">
                {use}
                <span className="text-brand-strong">⬢</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

const SETUP = [
  { title: "Susun organisasi", text: "Buat unit, undang anggota, dan tentukan hak aksesnya." },
  { title: "Rekrut role AI", text: "Beri nama, jabatan, cara kerja, kriteria hasil, dan karakternya." },
  { title: "Unggah pengetahuan", text: "Tentukan dokumen mana yang boleh dibaca tiap role atau unit." },
  { title: "Beri tugas", text: "Ikuti jalannya di linimasa dan putuskan saat diminta." },
];

export function Setup() {
  return (
    <section id="mulai" className="scroll-mt-24 max-w-7xl w-full mx-auto px-5 sm:px-10 pb-24 space-y-12">
      <header className="lp-reveal max-w-2xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Mulai</p>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-ink text-balance">Empat langkah membuka kantor</h2>
      </header>
      <ol className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {SETUP.map((item, i) => (
          <li key={item.title} className="lp-reveal group relative rounded-[28px] bg-white border border-line p-6 space-y-4 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_30px_60px_-28px_rgba(124,77,255,.55)]">
            <span className="lp-hex flex w-14 h-14 items-center justify-center bg-gradient-to-br from-brand to-brand-strong text-white text-xl font-extrabold transition-transform duration-500 group-hover:rotate-[360deg]">
              {i + 1}
            </span>
            <h3 className="font-bold text-ink text-lg">{item.title}</h3>
            <p className="text-sm text-muted leading-relaxed">{item.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const FAQ = [
  {
    q: "Apakah role AI bisa bertindak sendiri di luar aplikasi?",
    a: "Tidak. Role hanya membaca dokumen dan menulis hasil di dalam MBUTI. Ia tidak punya akses internet, email, atau berkas di luar sistem.",
  },
  {
    q: "Bagaimana kalau aturannya tidak ada di dokumen?",
    a: "Role diminta mengatakannya, bukan menebak, lalu tugas bisa naik ke penanggung jawab. Model AI tetap bisa keliru, jadi periksa hasil penting sebelum dipakai.",
  },
  {
    q: "Dokumen apa yang bisa diunggah?",
    a: "PDF berteks, DOCX, TXT, dan Markdown, maksimal 20 MB per berkas. Hasil pindaian (gambar) belum didukung.",
  },
  {
    q: "Ke mana isi dokumen dikirim?",
    a: "Potongan dokumen dan isi tugas dikirim ke model Gemini milik Google untuk diolah. Pada kunci tier gratis, gunakan hanya dokumen contoh atau publik.",
  },
  {
    q: "Apakah data antar-organisasi terpisah?",
    a: "Ya. Setiap role, dokumen, dan tugas terikat pada satu organisasi, dan anggota hanya melihat organisasinya sendiri.",
  },
];

export function Faq() {
  return (
    <section id="tanya" className="scroll-mt-24 max-w-3xl w-full mx-auto px-5 sm:px-10 pb-24 space-y-8">
      <h2 className="lp-reveal text-center text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Pertanyaan yang sering muncul</h2>
      <div className="space-y-3">
        {FAQ.map((item) => (
          <details key={item.q} className="lp-reveal group rounded-3xl bg-white border border-line px-5 open:shadow-[0_24px_50px_-30px_rgba(124,77,255,.6)] transition-shadow">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {item.q}
              <span className="shrink-0 w-8 h-8 rounded-xl bg-brand-soft text-brand flex items-center justify-center text-xl leading-none transition-transform duration-300 group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="pb-5 text-sm text-muted leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section className="max-w-7xl w-full mx-auto px-5 sm:px-10 pb-16">
      <div className="lp-reveal lp-night relative overflow-hidden rounded-[40px] px-6 sm:px-14 py-14 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-center text-white">
        <div className="space-y-5">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-balance">
            Buka kantor AI pertama <span className="lp-shimmer">organisasi Anda.</span>
          </h2>
          <p className="text-white/70 max-w-lg leading-relaxed">Mulai dari satu SOP dan dua role: satu menyusun, satu memeriksa.</p>
          <Link href="/login" className={`${buttonClasses("accent", "lg")} lp-shine`}>
            Masuk sekarang
          </Link>
        </div>
        <div className="relative flex justify-center">
          <div className="absolute inset-6 rounded-full bg-brand/50 blur-3xl" aria-hidden="true" />
          <BrandMascot width={400} className="relative h-auto max-w-full" />
        </div>
      </div>
    </section>
  );
}
