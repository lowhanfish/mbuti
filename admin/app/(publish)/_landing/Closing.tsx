import Link from "next/link";
import React from "react";
import { BrandMascot } from "../../(admin)/_components/brand-mark";
import { buttonClasses } from "../../(admin)/_components/ui/button-classes";
import Heading from "./Heading";
import Spotlight from "./Spotlight";

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
    <section id="mulai" className="scroll-mt-24 max-w-7xl w-full mx-auto px-5 sm:px-10 py-20 sm:py-24 space-y-12">
      <Heading tag="Mulai" title="Empat langkah membuka kantor" />
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {SETUP.map((item, i) => (
          <li key={item.title} className="lp-reveal group flex">
            <Spotlight className="flex-1 p-6 space-y-4">
              <span className="lp-hex flex w-14 h-14 items-center justify-center bg-gradient-to-br from-accent to-accent-strong text-ink text-xl font-extrabold transition-transform duration-500 group-hover:rotate-[360deg]">
                {i + 1}
              </span>
              <h3 className="font-bold text-white text-lg">{item.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{item.text}</p>
            </Spotlight>
          </li>
        ))}
      </ol>
    </section>
  );
}

const FAQ = [
  {
    q: "Apakah role AI bisa bertindak sendiri di luar aplikasi?",
    a: "Belum. Role bekerja dengan dokumen dan menulis hasil di dalam MBUTI. Pencarian internet hanya jalan bila Anda mengizinkannya untuk role itu, dan sumbernya ditampilkan. Role belum bisa membuka aplikasi lain, mengirim email, atau mengakses berkas di komputer Anda.",
  },
  {
    q: "Bagaimana kalau aturannya tidak ada di dokumen?",
    a: "Pada mode bawaan, Dari data, role diminta mengatakannya, bukan menebak, lalu tugas bisa naik ke penanggung jawab. Surat, tabel, dan laporan yang diminta tetap disusun dari data yang ada. Mode Lengkapi dan Susun bebas boleh menyusun bagian yang kosong, dan daftar bagian buatannya ditampilkan. Model AI tetap bisa keliru, jadi periksa hasil penting sebelum dipakai.",
  },
  {
    q: "Dokumen apa yang bisa diunggah?",
    a: "PDF (termasuk hasil pindaian), DOCX, TXT, Markdown, serta gambar PNG, JPG, dan WEBP, maksimal 20 MB per berkas. Jumlah halaman bergambar yang dibaca per dokumen dibatasi.",
  },
  {
    q: "Ke mana isi dokumen dikirim?",
    a: "Isi dokumen, termasuk gambar halamannya, dikirim ke model Gemini milik Google saat diolah dan saat dipakai, begitu juga isi tugas. Bila pencarian internet diizinkan, kata kuncinya dikirim ke mesin pencari. Pada kunci tier gratis, gunakan hanya dokumen contoh atau publik.",
  },
  {
    q: "Apakah data antar-organisasi terpisah?",
    a: "Ya. Setiap role, dokumen, dan tugas terikat pada satu organisasi, dan anggota hanya melihat organisasinya sendiri.",
  },
  {
    q: "Apakah harga di halaman ini sudah berlaku?",
    a: "Belum. Itu harga rencana. Pembayaran belum tersedia, batas paket belum diterapkan, dan angkanya masih bisa berubah.",
  },
  {
    q: "Bagaimana cara mendapatkan akun?",
    a: "Daftarkan organisasi dari halaman masuk, lalu verifikasi email Anda. Selama uji coba, organisasi baru aktif setelah disetujui pengelola. Anggota lain bergabung lewat undangan.",
  },
];

export function Faq() {
  return (
    <section id="tanya" className="scroll-mt-24 max-w-3xl w-full mx-auto px-5 sm:px-10 py-20 sm:py-24 space-y-10">
      <Heading center tag="Tanya jawab" title="Yang sering ditanyakan" />
      <div className="space-y-3">
        {FAQ.map((item) => (
          <details key={item.q} className="lp-reveal group rounded-3xl border border-white/10 bg-white/[0.04] px-5 transition-all open:border-accent/40 open:bg-white/[0.07]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-white [&::-webkit-details-marker]:hidden">
              {item.q}
              <span className="shrink-0 w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center text-xl leading-none transition-transform duration-300 group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="pb-5 text-sm text-white/65 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section className="max-w-7xl w-full mx-auto px-5 sm:px-10 pb-16">
      <div className="lp-reveal lp-cta relative overflow-hidden rounded-[40px] border border-white/10 px-6 sm:px-14 py-14 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-center text-white">
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
