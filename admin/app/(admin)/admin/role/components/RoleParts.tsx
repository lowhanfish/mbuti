import Link from "next/link";
import { Badge, Card } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { MODEL_PROFILE_LABEL, STATUS_LABEL, type AgentStatus, type ResponseInterface } from "../types";

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const variant = status === "active" ? "success" : status === "paused" ? "warning" : "neutral";
  return (
    <Badge variant={variant} size="sm" dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** Kartu role: karakter berdiri di "ruangan" berwarna unitnya. */
export function RoleCard({ role }: { role: ResponseInterface }) {
  const color = role.unit_color ?? "#7c4dff";
  return (
    <Link href={`/admin/role/${role.id}`} className="block group focus-visible:outline-2 focus-visible:outline-brand rounded-3xl">
      <Card interactive className="h-full">
        <div
          className="relative h-36 flex items-end justify-center overflow-hidden"
          style={{ background: `linear-gradient(160deg, ${color}22 0%, ${color}55 100%)` }}
        >
          <div className="absolute inset-x-0 bottom-0 h-8" style={{ background: `${color}33` }} aria-hidden="true" />
          <div
            className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-40 blur-2xl"
            style={{ background: color }}
            aria-hidden="true"
          />
          <div className="absolute top-3 left-3">
            <AgentStatusBadge status={role.status} />
          </div>
          <div className="absolute top-3 right-3 text-[10px] font-semibold text-ink/70 bg-white/70 backdrop-blur rounded-full px-2 py-0.5">
            {MODEL_PROFILE_LABEL[role.model_profile].label}
          </div>
          <div className="relative transition-transform duration-300 group-hover:-translate-y-1.5 group-hover:scale-105">
            <Avatar2D avatar={role.avatar} size={112} />
          </div>
        </div>
        <div className="p-4 space-y-2">
          <div>
            <h3 className="font-bold text-ink leading-tight flex items-center gap-1.5">
              {role.name}
              <Icon name="chevron" size={14} className="-rotate-90 text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-xs font-medium text-brand">{role.title}</p>
          </div>
          <p className="text-xs text-muted leading-relaxed line-clamp-2 min-h-[2.6em]">{role.goal || "Belum ada tujuan kerja."}</p>
          <div className="flex items-center gap-3 pt-2 border-t border-line/70 text-[11px] text-muted">
            <span className="flex items-center gap-1" title="Dokumen">
              <Icon name="book" size={13} className="text-faint" />
              {role.document_count}
            </span>
            <span className="flex items-center gap-1" title="Relasi">
              <Icon name="flow" size={13} className="text-faint" />
              {role.relation_count}
            </span>
            <span className="flex items-center gap-1 truncate ml-auto" title="Penanggung jawab">
              <Icon name="shield" size={13} className="text-faint" />
              <span className="truncate">{role.owner_name ?? "Belum ada PJ"}</span>
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
