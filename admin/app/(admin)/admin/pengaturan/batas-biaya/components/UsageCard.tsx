import { Card } from "../../../../_components/ui";
import { formatRupiah } from "../../../tugas/types";
import UsageRing from "./UsageRing";
import { monthLabel, type ResponseInterface } from "../types";

export default function UsageCard({ budget }: { budget: ResponseInterface }) {
  const { usage, monthly_budget } = budget;
  const exhausted = usage.used >= monthly_budget;

  return (
    <Card glow className="relative">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,184,28,.22),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(124,77,255,.18),transparent_55%)]"
        aria-hidden="true"
      />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-6 p-6 sm:p-8">
        <UsageRing used={usage.used} limit={monthly_budget} />
        <div className="flex-1 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted">Pemakaian {monthLabel(usage.month)}</p>
            <p className="text-3xl font-extrabold text-ink tracking-tight tabular-nums">
              {formatRupiah(usage.used)} <span className="text-base font-semibold text-faint">dari {formatRupiah(monthly_budget)}</span>
            </p>
            {usage.trial_cost > 0 && <p className="text-xs text-muted mt-1">Termasuk uji coba role {formatRupiah(usage.trial_cost)}.</p>}
            {exhausted && (
              <p className="text-sm font-semibold text-rose-600 mt-1">
                Anggaran bulan ini habis. Tugas baru ditolak dan langkah berikutnya dihentikan.
              </p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-3 max-w-lg">
            {[
              ["Sisa", formatRupiah(usage.remaining)],
              ["Tugas bulan ini", String(usage.task_count)],
              ["Rata-rata per tugas", formatRupiah(usage.task_count ? (usage.used - usage.trial_cost) / usage.task_count : 0)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-surface/80 border border-rim px-3 py-2.5">
                <dt className="text-[11px] text-muted">{label}</dt>
                <dd className="text-sm font-bold text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  );
}
