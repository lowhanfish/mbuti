"use client";

import React from "react";
import { Badge, Card, IconButton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { UNIT_COLORS, type ResponseInterface, type UnitNode } from "../types";

interface Actions {
  canEdit: boolean;
  onAddChild: (unit: ResponseInterface) => void;
  onEdit: (unit: ResponseInterface) => void;
  onDelete: (unit: ResponseInterface) => void;
}

function UnitActions({ unit, canEdit, onAddChild, onEdit, onDelete }: Actions & { unit: ResponseInterface }) {
  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <IconButton label={`Tambah sub-unit di ${unit.name}`} onClick={() => onAddChild(unit)}>
        <Icon name="plus" size={16} />
      </IconButton>
      <IconButton label={`Ubah ${unit.name}`} onClick={() => onEdit(unit)}>
        <Icon name="edit" size={16} />
      </IconButton>
      <IconButton label={`Hapus ${unit.name}`} tone="danger" onClick={() => onDelete(unit)}>
        <Icon name="trash" size={16} />
      </IconButton>
    </div>
  );
}

function UnitTile({ unit, size = 44 }: { unit: ResponseInterface; size?: number }) {
  return (
    <span
      className={`rounded-2xl bg-gradient-to-br ${UNIT_COLORS[unit.color].gradient} text-white text-[11px] font-extrabold tracking-wide flex items-center justify-center shadow-md shrink-0`}
      style={{ width: size, height: size }}
    >
      {unit.code || unit.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Tampilan pohon: satu baris per unit dengan garis penghubung ke induk. */
export function UnitTreeView({ nodes, ...actions }: Actions & { nodes: UnitNode[] }) {
  const renderNode = (node: UnitNode): React.ReactNode => (
    <li key={node.id} className="relative">
      <div className="group flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-surface transition-all">
        <UnitTile unit={node} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink truncate">{node.name}</span>
            {node.child_count > 0 && <Badge size="sm">{node.child_count} sub-unit</Badge>}
          </div>
          <p className="text-xs text-muted truncate">{node.description || "Belum ada uraian tugas."}</p>
        </div>
        <div className="hidden md:flex items-center gap-4 text-xs text-muted shrink-0">
          <span className="flex items-center gap-1.5" title="Penanggung jawab">
            <Icon name="shield" size={14} className="text-faint" />
            {node.lead_name ?? <span className="text-faint">Belum ada</span>}
          </span>
          <span className="flex items-center gap-1.5" title="Anggota tim">
            <Icon name="users" size={14} className="text-faint" />
            {node.member_count}
          </span>
          <span className="flex items-center gap-1.5" title="Role AI">
            <Icon name="agent" size={14} className="text-faint" />
            {node.agent_count}
          </span>
        </div>
        <div className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          <UnitActions unit={node} {...actions} />
        </div>
      </div>
      {node.children.length > 0 && (
        <ul className="ml-[34px] pl-4 border-l-2 border-dashed border-line space-y-0.5">{node.children.map(renderNode)}</ul>
      )}
    </li>
  );

  return <ul className="space-y-0.5">{nodes.map(renderNode)}</ul>;
}

/** Tampilan kartu: setiap unit seperti ruangan berwarna. */
export function UnitCardView({ items, ...actions }: Actions & { items: ResponseInterface[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
      {items.map((unit) => (
        <Card key={unit.id} interactive className="group">
          <div className={`relative h-24 bg-gradient-to-br ${UNIT_COLORS[unit.color].gradient} overflow-hidden`}>
            <div className="absolute -right-6 -top-10 w-32 h-32 rounded-full bg-white/15" aria-hidden="true" />
            <div className="absolute right-16 bottom-[-30px] w-20 h-20 rounded-full bg-white/10" aria-hidden="true" />
            <div className="relative p-4 flex items-start justify-between text-white">
              <span className="text-[11px] font-extrabold tracking-[0.2em] bg-white/20 rounded-lg px-2 py-1 backdrop-blur">
                {unit.code || "—"}
              </span>
              <div className="bg-surface/90 rounded-xl text-ink opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <UnitActions unit={unit} {...actions} />
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <h3 className="font-bold text-ink leading-tight">{unit.name}</h3>
              <p className="text-[11px] text-faint mt-0.5">
                {unit.parent_name ? `Bagian dari ${unit.parent_name}` : "Unit utama"}
              </p>
            </div>
            <p className="text-xs text-muted leading-relaxed line-clamp-2 min-h-[2.5em]">
              {unit.description || "Belum ada uraian tugas."}
            </p>
            <div className="flex items-center justify-between pt-3 border-t border-line/70 text-xs text-muted">
              <span className="flex items-center gap-1.5 truncate">
                <Icon name="shield" size={14} className="text-faint" />
                {unit.lead_name ?? "Belum ada PJ"}
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1" title="Anggota tim">
                  <Icon name="users" size={14} className="text-faint" />
                  {unit.member_count}
                </span>
                <span className="flex items-center gap-1" title="Role AI">
                  <Icon name="agent" size={14} className="text-faint" />
                  {unit.agent_count}
                </span>
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
