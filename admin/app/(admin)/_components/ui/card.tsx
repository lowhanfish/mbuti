import React from "react";

interface SlotProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({
  children,
  className = "",
  interactive = false,
  glow = false,
}: SlotProps & { interactive?: boolean; glow?: boolean }) {
  return (
    <div
      className={`glass rounded-3xl overflow-hidden ${interactive ? "card-hover" : ""} ${
        glow ? "ring-gradient" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: SlotProps) {
  return (
    <div className={`flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-line/70 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "" }: SlotProps) {
  return <h3 className={`text-[15px] font-bold text-ink tracking-tight ${className}`}>{children}</h3>;
}

export function CardContent({ children, className = "" }: SlotProps) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

const STAT_TONES = {
  brand: "from-[#9b6bff] to-brand-strong shadow-[0_10px_22px_-8px_rgba(124,77,255,.7)]",
  accent: "from-[#ffd25c] to-accent-strong shadow-[0_10px_22px_-8px_rgba(245,158,11,.7)]",
  pink: "from-pink-400 to-fuchsia-600 shadow-[0_10px_22px_-8px_rgba(217,70,239,.6)]",
  teal: "from-teal-300 to-emerald-500 shadow-[0_10px_22px_-8px_rgba(16,185,129,.6)]",
};

/** Kartu angka ringkasan dengan ikon bergradasi. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: keyof typeof STAT_TONES;
  /** Angka dan keterangan diganti kerangka selama data dimuat */
  loading?: boolean;
}) {
  return (
    <Card interactive className="group">
      <div className="relative p-5 flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="text-xs font-semibold text-muted">{label}</p>
          {loading ? (
            <div className="space-y-2 pt-1 motion-safe:animate-pulse" aria-busy="true">
              <div className="h-8 w-20 rounded-lg bg-brand-soft" />
              <div className="h-3 w-28 rounded-md bg-brand-soft/70" />
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-ink tabular-nums tracking-tight">{value}</p>
              {hint && <p className="text-[11px] text-faint">{hint}</p>}
            </>
          )}
        </div>
        <div
          className={`w-12 h-12 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${STAT_TONES[tone]}`}
        >
          {icon}
        </div>
        <div
          className={`pointer-events-none absolute -right-10 -bottom-12 w-32 h-32 rounded-full bg-gradient-to-br opacity-[0.08] ${STAT_TONES[tone]}`}
          aria-hidden="true"
        />
      </div>
    </Card>
  );
}
