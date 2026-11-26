const RADIUS = 52;
const LENGTH = 2 * Math.PI * RADIUS;

/** Cincin pemakaian anggaran; warnanya berubah menjelang dan saat melewati batas. */
export default function UsageRing({ used, limit, size = 144 }: { used: number; limit: number; size?: number }) {
  const ratio = used / Math.max(limit, 1);
  const pct = ratio > 0 && ratio < 0.01 ? "<1" : String(Math.round(ratio * 100));
  const color = ratio >= 1 ? "#e11d48" : ratio >= 0.75 ? "#f59e0b" : "#7c4dff";

  return (
    <div className="relative shrink-0 self-center" style={{ width: size, height: size }} role="img" aria-label={`${pct}% anggaran terpakai`}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--color-line)" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - Math.min(1, ratio))}
          className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
          style={{ opacity: ratio > 0 ? 1 : 0 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-ink tabular-nums">{pct}%</span>
        <span className="text-[10px] font-semibold text-faint">terpakai</span>
      </div>
    </div>
  );
}
