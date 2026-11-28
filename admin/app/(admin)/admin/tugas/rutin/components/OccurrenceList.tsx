import React from "react";
import { formatDay, type Occurrence } from "../types";

export default function OccurrenceList({ items }: { items: Occurrence[] }) {
  if (!items.length) return <p className="text-xs text-faint">Tidak ada putaran berikutnya.</p>;
  return (
    <ol className="space-y-1.5">
      {items.map((o) => {
        const skipped = o.status !== "run";
        return (
          <li key={`${o.date}-${o.status}-${o.moved_from ?? ""}`} className="flex items-start gap-2 text-xs">
            <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${skipped ? "bg-line" : "bg-emerald-500"}`} />
            <span className={skipped ? "text-faint" : "text-ink"}>
              <span className={`font-semibold ${skipped ? "line-through" : ""}`}>
                {formatDay(o.date)} · {o.time}
              </span>
              {o.reason && <span className="block text-[11px] text-muted">{o.reason}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
