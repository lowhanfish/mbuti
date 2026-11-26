"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "../../../_components/ui";
import { formatRupiah } from "../../tugas/types";
import type { DailyCost } from "../types";

const parse = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short" });
const fullDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });

/** Batang biaya harian: satu seri, satu warna; nilai muncul saat disorot atau difokus. */
export default function DailyCostChart({ days }: { days?: DailyCost[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...(days ?? []).map((d) => d.cost), 1);
  const total = (days ?? []).reduce((sum, d) => sum + d.cost, 0);
  const shown = days && active !== null ? days[active] : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Biaya 7 hari terakhir</CardTitle>
          <p className="text-[11px] text-muted mt-0.5 tabular-nums" aria-live="polite">
            {shown ? `${fullDate.format(parse(shown.date))}: ${formatRupiah(shown.cost)}` : `Total ${formatRupiah(total)}`}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {!days ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <ul className="flex items-end gap-0.5 h-40 border-b border-line" onMouseLeave={() => setActive(null)}>
              {days.map((d, i) => (
                <li key={d.date} className="flex-1 h-full">
                  <button
                    type="button"
                    aria-label={`${fullDate.format(parse(d.date))}: ${formatRupiah(d.cost)}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="w-full h-full flex items-end justify-center rounded-t-lg hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <span
                      className={`block w-6 max-w-[70%] rounded-t transition-[height,background-color] duration-700 ease-out ${
                        active === i ? "bg-brand-strong" : "bg-brand"
                      }`}
                      style={{ height: d.cost ? `${Math.max(3, (d.cost / max) * 100)}%` : 0 }}
                    />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-0.5 pt-1.5" aria-hidden="true">
              {days.map((d, i) => (
                <span key={d.date} className={`flex-1 text-center text-[10px] ${i === days.length - 1 ? "font-bold text-ink" : "text-faint"}`}>
                  {i === days.length - 1 ? "Hari ini" : weekday.format(parse(d.date))}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
