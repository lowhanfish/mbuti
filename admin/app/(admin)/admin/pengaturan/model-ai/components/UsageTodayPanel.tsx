import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../_components/ui";
import { formatRupiah } from "../../../tugas/types";
import { USAGE_PURPOSE_LABEL, type ResponseInterface } from "../types";

/** Pemakaian model hari ini per jenis, untuk memantau kuota Gemini yang dipakai bersama. */
export default function UsageTodayPanel({ settings }: { settings: ResponseInterface }) {
  const rows = settings.usage_today;
  const total = rows.reduce((n, r) => n + r.calls, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pemakaian hari ini</CardTitle>
        <span className="text-[11px] text-faint">{total} panggilan</span>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.purpose} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink font-semibold">{USAGE_PURPOSE_LABEL[r.purpose]}</span>
              <span className="text-muted tabular-nums">
                {r.calls} · {formatRupiah(r.cost)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-brand-soft overflow-hidden">
              <div className="h-full bg-brand" style={{ width: `${total ? Math.round((r.calls / total) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
        <p className="text-[11px] text-faint pt-1">Kuota Gemini tier gratis dipakai bersama aplikasi lain; batas harian dicek di konsol Google.</p>
      </CardContent>
    </Card>
  );
}
