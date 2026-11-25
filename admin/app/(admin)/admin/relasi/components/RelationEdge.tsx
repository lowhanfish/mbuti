"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import React, { memo } from "react";
import { Icon } from "../../../_components/admin-icons";
import { RELATION_STYLE, type RelationInterface } from "../types";

export type RelationFlowEdge = Edge<RelationInterface & { dimmed: boolean; highlighted: boolean }, "relation">;

export const RelationEdge = memo(function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<RelationFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const style = RELATION_STYLE[data.relation_type];
  const active = selected || data.highlighted;

  return (
    <>
      {/* Lapisan pendar saat dipilih atau termasuk rute */}
      {active && <BaseEdge id={`${id}-glow`} path={path} style={{ stroke: style.color, strokeWidth: 10, opacity: 0.18 }} />}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={active || data.relation_type === "handoff" ? "relation-flow" : undefined}
        style={{
          stroke: style.color,
          strokeWidth: active ? 3 : 2,
          strokeDasharray: style.dashed || active || data.relation_type === "handoff" ? "7 6" : undefined,
          opacity: data.dimmed ? 0.18 : 1,
          transition: "opacity .3s, stroke-width .2s",
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan absolute pointer-events-auto cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-bold text-white flex items-center gap-1 shadow-md transition-all ${
            data.dimmed ? "opacity-20" : ""
          } ${active ? "scale-110" : "hover:scale-105"}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, background: style.color }}
        >
          <Icon name={style.icon} size={11} />
          {data.label || style.label}
          {data.relation_type === "review" && <span className="opacity-80">· maks {data.max_revisions}×</span>}
          {data.requires_approval && data.relation_type !== "escalate" && <span title="Perlu persetujuan manusia">· ✋</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export const edgeTypes = { relation: RelationEdge };
