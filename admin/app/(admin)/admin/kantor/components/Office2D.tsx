"use client";

import React from "react";
import { Card } from "../../../_components/ui";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { buildLayout, tint } from "../office-layout";
import type { OfficeState } from "../types";
import { ActivityBadge } from "./OfficePanel";

/** Tampilan denah 2D: ringan untuk layar sempit, perangkat lemah, atau pengguna yang mengurangi gerakan. */
export default function Office2D({
  state,
  onSelectUnit,
  onSelectAgent,
}: {
  state: OfficeState;
  onSelectUnit: (id: string) => void;
  onSelectAgent: (id: string) => void;
}) {
  const { rooms } = buildLayout(state.units, state.agents);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 p-1 stagger">
      {rooms.map((room) => (
        <Card key={room.unit.id} interactive className="overflow-hidden">
          <button
            type="button"
            onClick={() => onSelectUnit(room.unit.id)}
            className="w-full text-left px-4 py-3 text-white flex items-center justify-between cursor-pointer"
            style={{ background: `linear-gradient(120deg, ${room.unit.color}, ${tint(room.unit.color, 0.2)})` }}
          >
            <span>
              <span className="block text-[10px] font-bold tracking-[0.18em] opacity-80">{room.unit.code || "UNIT"}</span>
              <span className="block font-bold">{room.unit.name}</span>
            </span>
            {room.unit.active_task_count > 0 && <span className="text-[10px] font-bold bg-ink/80 text-accent rounded-full px-2 py-1">{room.unit.active_task_count} aktif</span>}
          </button>
          <div className="p-3 grid grid-cols-3 gap-2" style={{ background: tint(room.unit.color, 0.86) }}>
            {room.agents.map(({ agent }) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelectAgent(agent.id)}
                className="rounded-2xl bg-white/85 border border-white p-2 flex flex-col items-center gap-1 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <Avatar2D avatar={agent.avatar} size={52} className={["working", "reviewing", "consulting"].includes(agent.activity) ? "animate-float" : ""} />
                <span className="text-xs font-bold text-ink truncate max-w-full">{agent.name}</span>
                <ActivityBadge activity={agent.activity} />
              </button>
            ))}
            {room.agents.length === 0 && <p className="col-span-3 text-xs text-faint text-center py-4">Ruangan kosong</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}
