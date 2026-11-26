import React from "react";
import Heading from "./Heading";
import Spotlight from "./Spotlight";

const ROWS = [
  { topic: "Dasar jawaban", chat: "Pengetahuan umum model", office: "Dokumen kerja Anda, dengan rujukan halaman" },
  { topic: "Pembagian kerja", chat: "Satu percakapan", office: "Banyak role dengan relasi yang Anda atur" },
  { topic: "Pemeriksaan", chat: "Anda periksa sendiri", office: "Role pemeriksa lebih dulu, lalu Anda" },
  { topic: "Keputusan", chat: "Tidak ada titik berhenti", office: "Persetujuan manusia di titik yang dipilih" },
  { topic: "Jejak dan biaya", chat: "Tersebar di riwayat obrolan", office: "Linimasa per tugas, biaya dicatat dan dibatasi" },
];

export function Comparison() {
  return (
    <section id="beda" className="scroll-mt-24 max-w-5xl w-full mx-auto px-5 sm:px-10 py-20 sm:py-24 space-y-10">
      <Heading center tag="Bedanya" title="Dari obrolan ke alur kerja" />
      <div className="lp-reveal overflow-x-auto rounded-[28px] border border-white/10 bg-white/[0.03]">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-[0.14em]">
              <th scope="col" className="p-4 sm:p-5 font-semibold text-white/45">
                Hal
              </th>
              <th scope="col" className="p-4 sm:p-5 font-semibold text-white/45">
                Chatbot pada umumnya
              </th>
              <th scope="col" className="lp-column p-4 sm:p-5 font-bold text-accent">
                Kantor AI MBUTI
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.topic} className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.03]">
                <th scope="row" className="p-4 sm:p-5 font-semibold text-white">
                  {row.topic}
                </th>
                <td className="p-4 sm:p-5 text-white/50">{row.chat}</td>
                <td className="lp-column p-4 sm:p-5 font-medium text-white">
                  <span className="mr-2 text-accent" aria-hidden="true">
                    ✓
                  </span>
                  {row.office}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const CONTROLS = [
  { icon: "✋", title: "Berhenti kapan Anda mau", text: "Persetujuan manusia bisa dipasang di relasi mana pun, dan tugas bisa dihentikan di tengah jalan." },
  { icon: "⛽", title: "Biaya punya pagar", text: "Batas per tugas dan per bulan, ditambah batas langkah dan putaran revisi." },
  { icon: "🏢", title: "Data tiap organisasi terpisah", text: "Role, dokumen, dan tugas terikat pada satu organisasi, dengan empat tingkat hak akses." },
  { icon: "🔑", title: "Kunci tidak sampai ke peramban", text: "Kunci model hanya ada di server. Kata sandi disimpan dalam bentuk hash." },
];

export function Control() {
  return (
    <section id="kendali" className="scroll-mt-24 max-w-7xl w-full mx-auto px-5 sm:px-10 py-20 sm:py-24 space-y-12">
      <Heading tag="Kendali" title="AI yang bekerja, Anda yang pegang kemudi" text="Pengaman dipasang di mesin kerjanya, bukan sekadar diminta lewat instruksi." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CONTROLS.map((item) => (
          <div key={item.title} className="lp-reveal flex">
            <Spotlight className="flex-1 p-6 space-y-4">
              <span className="lp-hex lp-bob flex w-16 h-16 items-center justify-center bg-gradient-to-br from-brand/60 to-accent/40 text-2xl" aria-hidden="true">
                {item.icon}
              </span>
              <h3 className="font-bold text-white">{item.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{item.text}</p>
            </Spotlight>
          </div>
        ))}
      </div>
    </section>
  );
}

const ROADMAP = [
  {
    phase: "Sudah tersedia",
    tone: "#34d399",
    items: ["Organisasi, unit, dan hak akses", "Role, peta relasi, dan pengetahuan", "Tugas lintas role dan persetujuan", "Kantor 3D, dasbor, dan batas biaya"],
  },
  {
    phase: "Berikutnya",
    tone: "#ffb81c",
    items: ["Uji alur ujung ke ujung", "Audit log dan cadangan database", "Pemantauan galat", "Pemasangan di server"],
  },
  {
    phase: "Menuju SaaS",
    tone: "#9b6bff",
    items: ["Pendaftaran mandiri dan undangan email", "Satu akun di beberapa organisasi", "Paket langganan dan pembayaran", "Panel pengelola platform"],
  },
];

export function Roadmap() {
  return (
    <section id="peta-jalan" className="scroll-mt-24 max-w-7xl w-full mx-auto px-5 sm:px-10 py-20 sm:py-24 space-y-12">
      <Heading center tag="Peta jalan" title="Dibangun terbuka, selangkah demi selangkah" />
      <ol className="grid gap-5 lg:grid-cols-3">
        {ROADMAP.map((stage) => (
          <li key={stage.phase} className="lp-reveal relative flex">
            <Spotlight className="flex-1 p-6 sm:p-7 space-y-5">
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${stage.tone}, transparent)` }} aria-hidden="true" />
              <h3 className="flex items-center gap-3 font-bold text-white">
                <span className="relative flex w-4 h-4">
                  <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: stage.tone }} />
                  <span className="relative w-4 h-4 rounded-full" style={{ background: stage.tone }} />
                </span>
                {stage.phase}
              </h3>
              <ul className="space-y-2.5">
                {stage.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-white/70">
                    <span style={{ color: stage.tone }} aria-hidden="true">
                      ⬢
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Spotlight>
          </li>
        ))}
      </ol>
    </section>
  );
}
