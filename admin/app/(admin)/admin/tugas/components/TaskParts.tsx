import Link from "next/link";
import React from "react";
import { formatDate } from "@/utilities/labels";
import { Badge, Card } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { TASK_STATUS, formatRupiah, type AgentRef, type ResponseInterface, type TaskStatus } from "../types";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS[status];
  return (
    <Badge variant={s.variant} size="sm">
      {s.live ? (
        <span className="relative flex w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-current animate-ping opacity-60" />
          <span className="relative w-2 h-2 rounded-full bg-current" />
        </span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      )}
      {s.label}
    </Badge>
  );
}

/** Deretan avatar role yang terlibat, bertumpuk. */
export function AgentStack({ agents, size = 34 }: { agents: AgentRef[]; size?: number }) {
  return (
    <div className="flex -space-x-2">
      {agents.slice(0, 5).map((a) => (
        <span
          key={a.id}
          title={`${a.name} · ${a.title}`}
          className="rounded-xl border-2 border-white flex items-end justify-center overflow-hidden shadow-sm"
          style={{ width: size, height: size, background: `${a.unit_color ?? "#7c4dff"}33` }}
        >
          <Avatar2D avatar={a.avatar} size={size - 4} />
        </span>
      ))}
      {agents.length > 5 && (
        <span className="rounded-xl border-2 border-white bg-canvas text-[10px] font-bold text-muted flex items-center justify-center" style={{ width: size, height: size }}>
          +{agents.length - 5}
        </span>
      )}
    </div>
  );
}

/** Bilah biaya terhadap batas tugas. */
export function BudgetMeter({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const tone = pct >= 100 ? "bg-rose-500" : pct >= 75 ? "bg-amber-400" : "bg-gradient-to-r from-brand to-[#9b6bff]";
  return (
    <div className="space-y-1" title={`${formatRupiah(used)} dari ${formatRupiah(limit)}`}>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{formatRupiah(used)}</span>
        <span className="text-faint">/ {formatRupiah(limit)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className={`h-full rounded-full ${tone} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TaskCard({ task }: { task: ResponseInterface }) {
  const live = TASK_STATUS[task.status].live;
  return (
    <Link href={`/admin/tugas/${task.id}`} className="block group rounded-3xl focus-visible:outline-2 focus-visible:outline-brand">
      <Card interactive glow={task.status === "waiting_approval"} className={`h-full ${live ? "ring-2 ring-brand/20" : ""}`}>
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} />
                {task.priority === "high" && (
                  <Badge size="sm" variant="danger">
                    Prioritas tinggi
                  </Badge>
                )}
              </div>
              <h3 className="font-bold text-ink leading-snug group-hover:text-brand transition-colors">{task.title}</h3>
              <p className="text-xs text-muted line-clamp-2">{task.brief}</p>
            </div>
            <Icon name="chevron" size={16} className="-rotate-90 text-faint shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <AgentStack agents={task.participants} />
            <div className="text-right text-[11px] text-muted">
              <p>
                <strong className="text-ink">{task.steps_done}</strong> langkah selesai
              </p>
              {task.pending_approval_count > 0 && <p className="text-amber-700 font-semibold">{task.pending_approval_count} menunggu keputusan</p>}
            </div>
          </div>

          <BudgetMeter used={task.cost_used} limit={task.budget_limit} />

          <p className="text-[11px] text-faint flex items-center gap-1.5">
            <Icon name="users" size={12} />
            {task.created_by_name ?? "—"} · {formatDate(task.created_at)}
            {task.due_at && <span className="ml-auto">Tenggat {formatDate(task.due_at)}</span>}
          </p>
        </div>
      </Card>
    </Link>
  );
}
