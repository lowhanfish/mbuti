import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { formatRupiah } from "../../tugas/types";
import type { BusyAgent } from "../types";

export default function BusyAgents({ items }: { items?: BusyAgent[] }) {
  const max = Math.max(...(items ?? []).map((b) => b.step_count), 1);
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <div>
          <CardTitle>Role paling sibuk</CardTitle>
          <p className="text-[11px] text-muted mt-0.5">Menurut langkah yang selesai bulan ini</p>
        </div>
        <Link href="/admin/role" className="text-xs font-semibold text-brand hover:underline">
          Semua role →
        </Link>
      </CardHeader>
      {!items ? (
        <CardContent>
          <Skeleton className="h-40" />
        </CardContent>
      ) : items.length === 0 ? (
        <EmptyState icon={<Icon name="agent" size={26} />} title="Belum ada pekerjaan bulan ini" description="Role yang menyelesaikan langkah akan muncul di sini." />
      ) : (
        <ul className="p-3 space-y-1 stagger">
          {items.map((b) => (
            <li key={b.agent.id}>
              <Link href={`/admin/role/${b.agent.id}`} className="group flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white transition-colors">
                <span
                  className="w-11 h-11 rounded-xl flex items-end justify-center overflow-hidden shrink-0 transition-transform group-hover:scale-110 group-hover:-rotate-3"
                  style={{ background: `${b.agent.unit_color ?? "#7c4dff"}2a` }}
                >
                  <Avatar2D avatar={b.agent.avatar} size={40} />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-col sm:flex-row sm:items-baseline justify-between sm:gap-3">
                    <span className="text-sm font-bold text-ink truncate">
                      {b.agent.name} <span className="font-medium text-muted">· {b.agent.title}</span>
                    </span>
                    <span className="text-[11px] text-muted shrink-0 tabular-nums">
                      <strong className="text-ink">{b.step_count}</strong> langkah · {formatRupiah(b.cost)}
                    </span>
                  </span>
                  <span className="block h-2 rounded-full bg-line/70 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
                      style={{ width: `${(b.step_count / max) * 100}%` }}
                    />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
