import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "../../../_components/ui";
import UsageRing from "../../pengaturan/batas-biaya/components/UsageRing";
import { monthLabel } from "../../pengaturan/batas-biaya/types";
import { formatRupiah } from "../../tugas/types";
import type { ResponseInterface } from "../types";

export default function BudgetCard({ budget }: { budget?: ResponseInterface["budget"] }) {
  const ratio = budget ? budget.used / Math.max(budget.limit, 1) : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Anggaran bulan ini</CardTitle>
        {budget && (
          <Badge size="sm" variant={ratio >= 1 ? "danger" : ratio >= 0.75 ? "warning" : "success"}>
            {ratio >= 1 ? "Habis" : ratio >= 0.75 ? "Hampir habis" : "Aman"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 text-center">
        {!budget ? (
          <Skeleton className="w-36 h-36 rounded-full" />
        ) : (
          <>
            <UsageRing used={budget.used} limit={budget.limit} />
            <div>
              <p className="text-sm font-bold text-ink tabular-nums">
                {formatRupiah(budget.used)} <span className="font-medium text-faint">/ {formatRupiah(budget.limit)}</span>
              </p>
              <p className="text-[11px] text-muted">
                {monthLabel(budget.month)} · sisa {formatRupiah(budget.remaining)}
              </p>
            </div>
            <Link href="/admin/pengaturan/batas-biaya" className="text-xs font-semibold text-brand hover:underline">
              Atur batas biaya →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
