"use client";

import dynamic from "next/dynamic";
import React, { useState, useSyncExternalStore } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FULLSCREEN_CLASSES,
  FullscreenButton,
  PageHeader,
  Skeleton,
  useFullscreen,
} from "../../_components/ui";
import { Icon } from "../../_components/admin-icons";
import CreateTaskModal from "../tugas/components/CreateTaskModal";
import { useCreateTask } from "../tugas/hooks/crud";
import Office2D from "./components/Office2D";
import OfficePanel from "./components/OfficePanel";
import { useResponseOffice } from "./hooks/crud";
import { ACTIVITY_LABEL, type AgentActivity } from "./types";

/** Three.js hanya dimuat di peramban dan hanya untuk tampilan 3D. */
const OfficeScene = dynamic(() => import("./components/OfficeScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Menyiapkan kantor…</div>,
});

/** Tampilan 2D dipilih otomatis untuk layar sempit atau bila pengguna mengurangi gerakan. */
const prefersLight = () =>
  typeof window !== "undefined" && (window.matchMedia("(max-width: 767px)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const noop = () => () => {};

const LEGEND: AgentActivity[] = ["working", "reviewing", "incoming", "waiting", "idle", "paused"];

export default function KantorPage() {
  const { Office, isLoading, isError, error, refetch } = useResponseOffice();
  const autoLight = useSyncExternalStore(noop, prefersLight, () => false);
  const [modeChoice, setModeChoice] = useState<"3d" | "2d" | null>(null);
  const mode = modeChoice ?? (autoLight ? "2d" : "3d");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [assign, setAssign] = useState<{ open: boolean; agentId?: string }>({ open: false });
  const createTask = useCreateTask();
  const { expanded, toggle } = useFullscreen();

  const busy = Office?.agents.filter((a) => ["working", "reviewing", "consulting", "incoming"].includes(a.activity)).length ?? 0;
  const waiting = Office?.agents.filter((a) => a.activity === "waiting").length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kantor"
        description="Lihat siapa yang sedang bekerja, memeriksa, atau menunggu keputusan. Klik ruangan atau karakter untuk detail."
        badge={
          Office && (
            <span className="flex gap-1.5">
              <Badge variant="info">{busy} bekerja</Badge>
              {waiting > 0 && <Badge variant="accent">{waiting} menunggu</Badge>}
            </span>
          )
        }
        action={
          <div className="glass rounded-xl p-1 flex" role="tablist" aria-label="Tampilan kantor">
            {(["3d", "2d"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setModeChoice(m)}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${mode === m ? "bg-ink text-canvas" : "text-muted hover:text-ink"}`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-[calc(100vh-190px)] min-h-[520px] rounded-[28px]" />
      ) : isError || !Office ? (
        <Card>
          <EmptyState
            icon={<Icon name="office" size={26} />}
            title="Kantor gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        </Card>
      ) : Office.units.length === 0 && Office.agents.length === 0 ? (
        <Card>
          <EmptyState icon={<Icon name="office" size={26} />} title="Kantor masih kosong" description="Susun unit dan buat role agar kantor terisi ruangan dan karakter." />
        </Card>
      ) : mode === "3d" ? (
        <div
          className={`overflow-hidden bg-gradient-to-b from-brand-soft/70 to-accent-soft/70 ${
            expanded ? FULLSCREEN_CLASSES : "relative h-[calc(100vh-190px)] min-h-[520px] rounded-[28px] glass"
          }`}
        >
          <OfficeScene
            extraControls={<FullscreenButton expanded={expanded} onToggle={toggle} />}
            state={Office}
            selectedUnit={unitId}
            selectedAgent={agentId}
            onSelectUnit={(id) => {
              setUnitId(id);
              setAgentId(null);
            }}
            onSelectAgent={(id) => {
              setAgentId(id);
              if (id) setUnitId(null);
            }}
          />
          <div className="absolute top-3 left-3 glass rounded-2xl px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 max-w-[calc(100%-24px)] pointer-events-none">
            {LEGEND.map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: ACTIVITY_LABEL[k].color }} />
                {ACTIVITY_LABEL[k].label}
              </span>
            ))}
          </div>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 hidden md:block rounded-full bg-night/85 text-white text-[11px] px-4 py-1.5 pointer-events-none">
            Seret untuk memutar · klik kanan + seret untuk menggeser · gulir untuk memperbesar
          </p>
          <OfficePanel
            state={Office}
            unitId={unitId}
            agentId={agentId}
            onSelectAgent={(id) => {
              setAgentId(id);
              setUnitId(null);
            }}
            onClose={() => {
              setUnitId(null);
              setAgentId(null);
            }}
            onAssign={(id) => setAssign({ open: true, agentId: id })}
          />
        </div>
      ) : (
        <div className={expanded ? `${FULLSCREEN_CLASSES} overflow-y-auto p-3 sm:p-5` : "relative"}>
          <div className="flex justify-end pb-2">
            <FullscreenButton expanded={expanded} onToggle={toggle} withLabel />
          </div>
          <Office2D
            state={Office}
            onSelectUnit={(id) => {
              setUnitId(id);
              setAgentId(null);
            }}
            onSelectAgent={(id) => {
              setAgentId(id);
              setUnitId(null);
            }}
          />
          {(unitId || agentId) && (
            <div className="fixed inset-0 z-40 bg-night/30 backdrop-blur-sm" onClick={() => (setUnitId(null), setAgentId(null))}>
              <div className="absolute inset-y-0 right-0 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                <OfficePanel
                  state={Office}
                  unitId={unitId}
                  agentId={agentId}
                  onSelectAgent={(id) => {
                    setAgentId(id);
                    setUnitId(null);
                  }}
                  onClose={() => {
                    setUnitId(null);
                    setAgentId(null);
                  }}
                  onAssign={(id) => setAssign({ open: true, agentId: id })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {assign.open && (
        <CreateTaskModal
          saving={createTask.isPending}
          defaultAgentId={assign.agentId}
          onClose={() => setAssign({ open: false })}
          onSubmit={(body) =>
            createTask.mutate(body, {
              onSuccess: () => {
                // Tetap di kantor agar karakter terlihat mulai bekerja
                setAssign({ open: false });
                setAgentId(body.entry_agent_id);
                setUnitId(null);
              },
            })
          }
        />
      )}
    </div>
  );
}
