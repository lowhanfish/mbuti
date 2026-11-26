import React from "react";
import { Avatar2D } from "../../(admin)/_components/agent/avatar-2d";
import { avatarFromSeed } from "../../(admin)/_components/agent/avatar-config";
import Heading from "./Heading";
import Spotlight from "./Spotlight";

function Card({
  title,
  text,
  className = "",
  children,
}: {
  title: string;
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`lp-reveal flex ${className}`}>
      <Spotlight className="flex-1 p-6 sm:p-7 flex flex-col gap-5">
        <div className="relative flex-1 min-h-40 flex items-center justify-center" aria-hidden="true">
          {children}
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-white/60 leading-relaxed">{text}</p>
        </div>
      </Spotlight>
    </div>
  );
}

const NODES = [
  { x: 58, y: 100, name: "Rani", color: "#9b6bff" },
  { x: 220, y: 42, name: "Sekar", color: "#14b8a6" },
  { x: 252, y: 142, name: "Tegar", color: "#f59e0b" },
  { x: 440, y: 92, name: "Anda", color: "#ec4899" },
];
const EDGES = [
  { d: "M58 100 Q130 38 220 42", color: "#14b8a6", label: "Konsultasi", x: 112, y: 40 },
  { d: "M58 100 Q140 166 252 142", color: "#f59e0b", label: "Periksa", x: 128, y: 166 },
  { d: "M252 142 Q360 160 440 92", color: "#ec4899", label: "Eskalasi", x: 376, y: 158 },
];

function RelationArt() {
  return (
    <svg viewBox="0 0 500 190" className="w-full max-w-xl">
      {EDGES.map((e) => (
        <g key={e.label}>
          <path d={e.d} fill="none" stroke={e.color} strokeWidth="3" strokeDasharray="9 8" strokeLinecap="round" className="lp-dash" />
          <text x={e.x} y={e.y} textAnchor="middle" fontSize="12" fontWeight="700" fill={e.color}>
            {e.label}
          </text>
          <circle r="6" fill={e.color}>
            <animateMotion dur="2.8s" repeatCount="indefinite" path={e.d} />
          </circle>
        </g>
      ))}
      {NODES.map((n) => (
        <g key={n.name}>
          <polygon
            points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15"
            transform={`translate(${n.x} ${n.y})`}
            fill="#1d1540"
            stroke={n.color}
            strokeWidth="3"
          />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#ffffff">
            {n.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

function CitationArt() {
  return (
    <div className="w-full max-w-xs rounded-2xl bg-[#1d1540] border border-white/10 p-4 shadow-2xl space-y-2.5 -rotate-2">
      {["w-11/12", "w-full", "w-4/5"].map((w, i) => (
        <div key={w} className="flex items-center gap-2">
          <span className={`h-2 rounded-full bg-white/15 ${w}`} />
          <span className="lp-pulse shrink-0 w-6 h-5 rounded-md bg-brand/35 text-[#d9ccff] text-[10px] font-bold flex items-center justify-center" style={{ animationDelay: `${i * 0.5}s` }}>
            [{i + 1}]
          </span>
        </div>
      ))}
      <div className="rounded-xl bg-accent/20 border border-accent/30 px-3 py-2 text-[11px] font-semibold text-[#ffd98a]">pedoman (v1), halaman 2</div>
    </div>
  );
}

function ApprovalArt() {
  return (
    <div className="w-full max-w-xs rounded-2xl bg-[#1d1540] border border-white/10 p-4 shadow-2xl rotate-2">
      <span className="inline-block rounded-full bg-accent/20 text-[10px] font-bold text-[#ffd98a] px-2 py-1">Menunggu keputusan</span>
      <p className="mt-2 text-sm font-bold text-white">Setujui surat sebelum dikirim.</p>
      <div className="mt-4 flex gap-2 text-xs font-semibold">
        <span className="rounded-xl border border-white/15 px-3 py-2 text-white/60">Tolak</span>
        <span className="rounded-xl border border-white/15 px-3 py-2 text-white/60">Minta revisi</span>
        <span className="lp-shine relative overflow-hidden rounded-xl bg-brand text-white px-3 py-2">Setujui</span>
      </div>
    </div>
  );
}

function BudgetArt() {
  return (
    <div className="w-full max-w-xs space-y-3">
      {[
        { label: "Biaya tugas", width: "46%", color: "from-[#9b6bff] to-brand-strong" },
        { label: "Langkah", width: "30%", color: "from-teal-300 to-emerald-500" },
        { label: "Putaran revisi", width: "66%", color: "from-[#ffd25c] to-accent-strong" },
      ].map((bar, i) => (
        <div key={bar.label} className="space-y-1">
          <div className="flex justify-between text-[11px] font-semibold text-white/60">
            <span>{bar.label}</span>
            <span>batas</span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden">
            <div className={`lp-fill h-full rounded-full bg-gradient-to-r ${bar.color}`} style={{ width: bar.width, animationDelay: `${i * 0.35}s` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function OfficeArt() {
  return (
    <div className="flex items-end gap-3 sm:gap-5">
      {["Rani", "Tegar", "Dina", "Bima", "Sekar"].map((name, i) => (
        <div key={name} className="flex flex-col items-center gap-2">
          <div className="lp-bob" style={{ animationDelay: `${i * -0.55}s` }}>
            <Avatar2D avatar={avatarFromSeed(name)} size={76} />
          </div>
          <span className="lp-hex w-9 h-3 bg-brand/50" />
        </div>
      ))}
    </div>
  );
}

export default function Features() {
  return (
    <section id="fitur" className="scroll-mt-24 max-w-7xl w-full mx-auto px-5 sm:px-10 py-20 sm:py-28 space-y-12">
      <Heading
        tag="Fitur"
        title={
          <>
            Bukan satu chatbot. <span className="lp-shimmer">Satu kantor.</span>
          </>
        }
        text="Anda yang menentukan siapa mengerjakan apa, siapa memeriksa siapa, dan di mana pekerjaan harus berhenti."
      />

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className="md:col-span-2"
          title="Peta relasi yang bisa Anda gambar"
          text="Tarik garis antar-role: serahkan, periksa, konsultasi, atau eskalasi ke manusia. Relasi bisa bersyarat, dan bisa punya jalur khusus bila hasil ditolak."
        >
          <RelationArt />
        </Card>
        <Card title="Rujukan sampai halaman" text="Hasil kerja menunjuk dokumen, versi, dan halaman yang dipakai, sehingga bisa dicek sebelum digunakan.">
          <CitationArt />
        </Card>
        <Card title="Persetujuan manusia" text="Pasang titik keputusan di mana pun. Tugas menunggu sampai orang yang ditunjuk menjawab.">
          <ApprovalArt />
        </Card>
        <Card title="Pengaman biaya dan langkah" text="Batas per tugas, per bulan, jumlah langkah, dan putaran revisi menghentikan tugas sebelum kelewatan.">
          <BudgetArt />
        </Card>
        <Card title="Kantor yang terlihat" text="Lihat di kantor 3D siapa yang sedang bekerja, memeriksa, atau menunggu Anda.">
          <OfficeArt />
        </Card>
      </div>
    </section>
  );
}
