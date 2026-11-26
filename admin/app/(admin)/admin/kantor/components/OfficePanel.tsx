"use client";

import Link from "next/link";
import React from "react";
import { Badge, Button, IconButton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { useResponseListDocument } from "../../pengetahuan/hooks/crud";
import { ACTIVITY_LABEL, type AgentActivity, type OfficeAgent, type OfficeState } from "../types";

export function ActivityBadge({ activity }: { activity: AgentActivity }) {
  const a = ACTIVITY_LABEL[activity];
  const live = ["working", "reviewing", "consulting", "incoming", "waiting"].includes(activity);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${a.color}1f`, color: a.color }}>
      <span className="relative flex w-1.5 h-1.5">
        {live && <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: a.color }} />}
        <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: a.color }} />
      </span>
      {a.label}
    </span>
  );
}

function AgentRow({ agent, onSelect }: { agent: OfficeAgent; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      className="w-full flex items-center gap-2.5 rounded-2xl bg-surface/85 border border-rim p-2 text-left hover:border-brand/40 hover:shadow-sm transition-all cursor-pointer"
    >
      <span className="w-10 h-10 rounded-xl bg-canvas flex items-end justify-center overflow-hidden shrink-0">
        <Avatar2D avatar={agent.avatar} size={38} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-ink truncate">{agent.name}</span>
          <ActivityBadge activity={agent.activity} />
        </span>
        <span className="block text-[11px] text-muted truncate">{agent.task_title ?? `${agent.title} · ${agent.tasks_today} tugas hari ini`}</span>
      </span>
    </button>
  );
}

function UnitDocs({ unitId }: { unitId: string }) {
  const { List, isLoading } = useResponseListDocument({ scope: "unit", scope_id: unitId });
  const docs = (List?.data ?? []).slice(0, 4);
  if (isLoading) {
    return (
      <div className="space-y-1.5 motion-safe:animate-pulse" aria-busy="true" aria-label="Memuat dokumen unit">
        <div className="h-3 w-3/4 rounded bg-brand-soft" />
        <div className="h-3 w-1/2 rounded bg-brand-soft/70" />
      </div>
    );
  }
  if (!docs.length) return <p className="text-xs text-faint">Belum ada dokumen unit.</p>;
  return (
    <ul className="space-y-1">
      {docs.map((d) => (
        <li key={d.id}>
          <Link href={`/admin/pengetahuan/${d.id}`} className="text-xs text-brand hover:underline truncate block">
            {d.active_version?.file_name ?? d.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Panel kanan: ringkasan ruangan (unit) atau satu role yang dipilih. */
export default function OfficePanel({
  state,
  unitId,
  agentId,
  onSelectAgent,
  onClose,
  onAssign,
}: {
  state: OfficeState;
  unitId: string | null;
  agentId: string | null;
  onSelectAgent: (id: string) => void;
  onClose: () => void;
  onAssign: (agentId: string | undefined) => void;
}) {
  const agent = agentId ? state.agents.find((a) => a.id === agentId) : null;
  const unit = state.units.find((u) => u.id === (agent?.unit_id ?? unitId)) ?? null;

  if (!agent && !unit) return null;

  return (
    <aside className="absolute top-3 right-3 bottom-3 w-[min(340px,calc(100%-24px))] glass rounded-3xl flex flex-col overflow-hidden rise z-10" aria-label="Detail kantor">
      <div className="relative px-5 pt-5 pb-4 text-white" style={{ background: `linear-gradient(135deg, ${unit?.color ?? "#7c4dff"}, #18122b)` }}>
        <IconButton label="Tutup panel" onClick={onClose} className="!absolute top-3 right-3 !text-white/80 hover:!bg-white/15 hover:!text-white">
          <Icon name="close" size={16} />
        </IconButton>
        {agent ? (
          <div className="flex items-center gap-3 pr-8">
            <span className="w-16 h-16 rounded-2xl bg-white/15 flex items-end justify-center overflow-hidden shrink-0">
              <Avatar2D avatar={agent.avatar} size={60} />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-extrabold leading-tight">{agent.name}</p>
              <p className="text-xs text-white/75">{agent.title}</p>
              <p className="text-[11px] text-white/60 mt-0.5">{unit?.name ?? "Belum ditempatkan"}</p>
            </div>
          </div>
        ) : (
          unit && (
            <div className="pr-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">{unit.code || "Unit"}</p>
              <p className="text-lg font-extrabold leading-tight">{unit.name}</p>
              <p className="text-[11px] text-white/70 mt-1">PJ: {unit.lead_name ?? "belum ditentukan"}</p>
            </div>
          )
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {agent ? (
          <>
            <div className="flex items-center justify-between">
              <ActivityBadge activity={agent.activity} />
              <span className="text-[11px] text-faint">{agent.tasks_today} tugas dalam 24 jam</span>
            </div>
            {agent.task_id && (
              <Link href={`/admin/tugas/${agent.task_id}`} className="block rounded-2xl bg-brand-soft/60 p-3 hover:bg-brand-soft transition-colors">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand">Tugas saat ini</p>
                <p className="text-sm font-semibold text-ink">{agent.task_title}</p>
              </Link>
            )}
            <div className="grid gap-2">
              {agent.status === "active" && (
                <Button icon={<Icon name="task" size={15} />} onClick={() => onAssign(agent.id)}>
                  Beri tugas ke {agent.name}
                </Button>
              )}
              <Link href={`/admin/role/${agent.id}`} className="text-center text-sm font-semibold text-brand hover:underline">
                Buka detail role
              </Link>
            </div>
          </>
        ) : (
          unit && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Role", state.agents.filter((a) => a.unit_id === unit.id).length],
                  ["Tugas aktif", unit.active_task_count],
                  ["Dokumen", unit.document_count],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-surface/85 border border-rim py-2">
                    <p className="text-lg font-bold text-ink">{v}</p>
                    <p className="text-[10px] text-muted">{k}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Role di ruangan ini</p>
                {state.agents
                  .filter((a) => a.unit_id === unit.id)
                  .map((a) => (
                    <AgentRow key={a.id} agent={a} onSelect={onSelectAgent} />
                  ))}
                {!state.agents.some((a) => a.unit_id === unit.id) && <p className="text-xs text-faint">Belum ada role. Buat di menu Role.</p>}
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Dokumen unit</p>
                <UnitDocs unitId={unit.id} />
              </div>
            </>
          )
        )}
      </div>

      {!agent && unit && (
        <div className="p-4 border-t border-line/70">
          <Button
            variant="accent"
            className="w-full"
            icon={<Icon name="sparkles" size={15} />}
            disabled={!state.agents.some((a) => a.unit_id === unit.id && a.status === "active")}
            onClick={() => onAssign(state.agents.find((a) => a.unit_id === unit.id && a.status === "active")?.id)}
          >
            Tugaskan divisi ini
          </Button>
          <p className="text-[10px] text-faint text-center mt-1.5">
            <Badge size="sm">Role pertama yang aktif menerima tugas</Badge>
          </p>
        </div>
      )}
    </aside>
  );
}
