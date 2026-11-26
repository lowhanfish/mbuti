"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import React, { memo } from "react";
import { initials } from "@/utilities/labels";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { STATUS_LABEL } from "../../role/types";
import type { GraphAgentNode, GraphHumanNode } from "../types";

export type FlowNodeState = {
  /** Bukan bagian dari rute yang sedang disorot */
  dimmed: boolean;
  /** Node awal rute yang sedang disorot */
  focused: boolean;
}

export type AgentFlowNode = Node<GraphAgentNode & FlowNodeState, "agent">;
export type HumanFlowNode = Node<GraphHumanNode & FlowNodeState, "human">;

const handleClass = "!w-3 !h-3 !border-2 !border-white !bg-brand shadow";

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps<AgentFlowNode>) {
  const color = data.unit_color ?? "#7c4dff";
  return (
    <div
      className={`w-[220px] rounded-2xl bg-surface/95 backdrop-blur border transition-all duration-300 ${
        selected || data.focused ? "border-brand shadow-[0_0_0_4px_rgba(124,77,255,.18),0_18px_30px_-14px_rgba(76,40,170,.5)]" : "border-rim shadow-[0_12px_26px_-14px_rgba(76,40,170,.45)]"
      } ${data.dimmed ? "opacity-30 saturate-50" : ""}`}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className="h-1.5 rounded-t-2xl" style={{ background: color }} />
      <div className="flex items-center gap-2.5 p-2.5">
        <div className="w-12 h-12 rounded-xl flex items-end justify-center overflow-hidden shrink-0" style={{ background: `${color}22` }}>
          <Avatar2D avatar={data.avatar} size={44} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink leading-tight truncate">{data.name}</p>
          <p className="text-[11px] font-medium text-brand truncate">{data.title}</p>
          <p className="text-[10px] text-faint truncate flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${data.status === "active" ? "bg-emerald-500" : data.status === "paused" ? "bg-amber-400" : "bg-slate-300"}`}
            />
            {STATUS_LABEL[data.status]} · {data.unit_name ?? "Tanpa unit"}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  );
});

export const HumanNode = memo(function HumanNode({ data, selected }: NodeProps<HumanFlowNode>) {
  return (
    <div
      className={`w-[200px] rounded-full bg-gradient-to-r from-night to-[#3b2580] text-white pl-1.5 pr-4 py-1.5 flex items-center gap-2.5 transition-all duration-300 ${
        selected || data.focused ? "shadow-[0_0_0_4px_rgba(236,72,153,.25),0_16px_28px_-12px_rgba(24,18,43,.7)]" : "shadow-[0_12px_24px_-12px_rgba(24,18,43,.7)]"
      } ${data.dimmed ? "opacity-30" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-white !bg-pink-500" />
      <span className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-strong text-ink text-sm font-bold flex items-center justify-center shrink-0">
        {initials(data.name)}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold truncate">{data.name}</span>
        <span className="block text-[10px] text-white/60 truncate">Manusia · {data.title}</span>
      </span>
    </div>
  );
});

export const nodeTypes = { agent: AgentNode, human: HumanNode };
