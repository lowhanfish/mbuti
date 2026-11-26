"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeMouseHandler,
} from "@xyflow/react";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { Button, FULLSCREEN_CLASSES, FullscreenButton, IconButton, Modal, useFullscreen } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { useResponseOptionLead } from "../../organisasi/unit/hooks/crud";
import {
  useAddHuman,
  useCreateRelation,
  useDeleteRelation,
  useRemoveHuman,
  useResetPositions,
  useSavePositions,
  useUpdateRelation,
} from "../hooks/crud";
import { autoLayout, downstream } from "../layout-graph";
import { RELATION_STYLE, emptyRelation, type GraphInterface, type GraphNode, type RelationFields, type RelationInterface } from "../types";
import { edgeTypes, type RelationFlowEdge } from "./RelationEdge";
import { nodeTypes, type AgentFlowNode, type HumanFlowNode } from "./FlowNodes";
import RelationForm from "./RelationForm";

type FlowNode = AgentFlowNode | HumanFlowNode;

function toFlowNodes(graph: GraphInterface): FlowNode[] {
  const positions = autoLayout(graph.nodes, graph.positions);
  return graph.nodes.map((n) =>
    n.kind === "agent"
      ? { id: n.id, type: "agent", position: positions[n.id], data: { ...n, dimmed: false, focused: false } }
      : { id: n.id, type: "human", position: positions[n.id], data: { ...n, dimmed: false, focused: false } }
  );
}

const pickFields = (r: RelationFields): RelationFields => ({
  relation_type: r.relation_type,
  trigger: r.trigger,
  condition: r.condition,
  payload_spec: r.payload_spec,
  expected_output: r.expected_output,
  max_revisions: r.max_revisions,
  requires_approval: r.requires_approval,
  label: r.label,
});

function EdgeEditor({
  relation,
  graph,
  canEdit,
  onClose,
}: {
  relation: RelationInterface;
  graph: GraphInterface;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RelationFields>(() => pickFields(relation));
  const update = useUpdateRelation();
  const remove = useDeleteRelation();
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const dirty = JSON.stringify(pickFields(form)) !== JSON.stringify(pickFields(relation));

  return (
    <div className="space-y-4">
      <RelationForm
        value={form}
        onChange={setForm}
        targetKind={relation.target_kind}
        sourceName={name(relation.source_id)}
        targetName={name(relation.target_id)}
        revisionLimit={graph.revision_limit}
        disabled={!canEdit}
      />
      {canEdit && (
        <div className="flex gap-2 pt-1">
          <Button
            variant="ghost"
            icon={<Icon name="trash" size={15} />}
            loading={remove.isPending}
            onClick={async () => {
              if (await confirmAlert("Hapus relasi ini?", `${name(relation.source_id)} → ${name(relation.target_id)}`, "Ya, hapus")) {
                remove.mutate(relation.id, { onSuccess: onClose });
              }
            }}
          >
            Hapus
          </Button>
          <Button className="flex-1" disabled={!dirty} loading={update.isPending} onClick={() => update.mutate({ id: relation.id, body: form })}>
            Simpan relasi
          </Button>
        </div>
      )}
    </div>
  );
}

function NodeInfo({ node, graph, canEdit, onClose }: { node: GraphNode; graph: GraphInterface; canEdit: boolean; onClose: () => void }) {
  const removeHuman = useRemoveHuman();
  const outgoing = graph.relations.filter((r) => r.source_id === node.id);
  const incoming = graph.relations.filter((r) => r.target_id === node.id);
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const route = downstream(node.id, graph.relations);

  const rows = (list: RelationInterface[], dir: "in" | "out") =>
    list.map((r) => (
      <li key={r.id} className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: RELATION_STYLE[r.relation_type].color }} />
        <span className="text-muted">{RELATION_STYLE[r.relation_type].label}</span>
        <span className="font-semibold text-ink truncate">{dir === "out" ? `→ ${name(r.target_id)}` : `← ${name(r.source_id)}`}</span>
      </li>
    ));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {node.kind === "agent" ? (
          <Avatar2D avatar={node.avatar} size={56} />
        ) : (
          <span className="w-12 h-12 rounded-full bg-night text-accent font-bold flex items-center justify-center">👤</span>
        )}
        <div className="min-w-0">
          <p className="font-bold text-ink">{node.name}</p>
          <p className="text-xs text-brand">{node.title}</p>
        </div>
      </div>
      {node.kind === "agent" && (
        <div className="rounded-2xl bg-brand-soft/60 p-3 text-xs text-brand-strong">
          Rute yang disorot: {route.nodes.size - 1} langkah lanjutan lewat {route.edges.size} relasi.
        </div>
      )}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Relasi keluar ({outgoing.length})</p>
        <ul className="space-y-1.5">{outgoing.length ? rows(outgoing, "out") : <li className="text-xs text-faint">Tidak ada.</li>}</ul>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint pt-2">Relasi masuk ({incoming.length})</p>
        <ul className="space-y-1.5">{incoming.length ? rows(incoming, "in") : <li className="text-xs text-faint">Tidak ada.</li>}</ul>
      </div>
      {node.kind === "agent" ? (
        <Link href={`/admin/role/${node.id}`} className="block text-center text-sm font-semibold text-brand hover:underline">
          Buka detail role
        </Link>
      ) : (
        canEdit && (
          <Button variant="outline" className="w-full" loading={removeHuman.isPending} onClick={() => removeHuman.mutate(node.id, { onSuccess: onClose })}>
            Keluarkan dari peta
          </Button>
        )
      )}
      {node.kind === "agent" && canEdit && (
        <p className="text-[11px] text-muted">Tarik dari titik di sisi kanan kartu ke role atau manusia lain untuk membuat relasi baru.</p>
      )}
    </div>
  );
}

function MapCanvas({ graph, canEdit }: { graph: GraphInterface; canEdit: boolean }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(toFlowNodes(graph));
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [pending, setPending] = useState<{ source: string; target: string; form: RelationFields } | null>(null);
  const [humanPicker, setHumanPicker] = useState(false);

  const { getNodes, fitView } = useReactFlow<FlowNode, RelationFlowEdge>();
  const { expanded, toggle } = useFullscreen();
  const savePositions = useSavePositions();
  const resetPositions = useResetPositions();
  const createRelation = useCreateRelation();
  const addHuman = useAddHuman();
  const { List: members } = useResponseOptionLead({ excludeViewers: true });

  // Setelah ukuran wadah berubah, peta disesuaikan agar seluruh node terlihat
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    if (wasExpanded.current === expanded) return;
    wasExpanded.current = expanded;
    const timer = setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 250);
    return () => clearTimeout(timer);
  }, [expanded, fitView]);

  const route = useMemo(() => (selectedNode ? downstream(selectedNode, graph.relations) : null), [selectedNode, graph.relations]);

  // Sorot rute: node & garis di luar rute dari node terpilih dibuat redup
  const viewNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, dimmed: Boolean(route && !route.nodes.has(n.id)), focused: n.id === selectedNode },
      })) as FlowNode[],
    [nodes, route, selectedNode]
  );

  const edges: RelationFlowEdge[] = useMemo(
    () =>
      graph.relations.map((r) => ({
        id: r.id,
        source: r.source_id,
        target: r.target_id,
        type: "relation",
        selected: r.id === selectedEdge,
        markerEnd: { type: MarkerType.ArrowClosed, color: RELATION_STYLE[r.relation_type].color, width: 18, height: 18 },
        data: { ...r, max_revisions: Math.min(r.max_revisions, graph.revision_limit), dimmed: Boolean(route && !route.edges.has(r.id)), highlighted: Boolean(route?.edges.has(r.id)) },
      })),
    [graph.relations, graph.revision_limit, route, selectedEdge]
  );

  const nodeById = (id: string) => graph.nodes.find((n) => n.id === id);

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    const target = nodeById(c.target);
    const form = emptyRelation(target?.kind === "human" ? "escalate" : "handoff");
    setPending({ source: c.source, target: c.target, form: { ...form, max_revisions: Math.max(1, Math.min(form.max_revisions, graph.revision_limit)) } });
  };

  const onNodeClick: NodeMouseHandler<FlowNode> = (_, node) => {
    setSelectedEdge(null);
    setSelectedNode((cur) => (cur === node.id ? null : node.id));
  };

  const selectedRelation = graph.relations.find((r) => r.id === selectedEdge) ?? null;
  const selectedGraphNode = selectedNode ? nodeById(selectedNode) ?? null : null;
  const humansOnMap = new Set(graph.nodes.filter((n) => n.kind === "human").map((n) => n.id));

  return (
    <div className={`overflow-hidden ${expanded ? FULLSCREEN_CLASSES : "relative h-[calc(100vh-190px)] min-h-[520px] rounded-[28px] glass"}`}>
      <ReactFlow<FlowNode, RelationFlowEdge>
        nodes={viewNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={canEdit ? onConnect : undefined}
        nodesConnectable={canEdit}
        nodesDraggable={canEdit}
        onNodeClick={onNodeClick}
        onEdgeClick={(_, edge) => {
          setSelectedNode(null);
          setSelectedEdge(edge.id);
        }}
        onPaneClick={() => {
          setSelectedNode(null);
          setSelectedEdge(null);
        }}
        onNodeDragStop={() => savePositions.mutate(Object.fromEntries(getNodes().map((n) => [n.id, n.position])))}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        forceColorMode="light"
        style={{ background: "transparent" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="#c9bdf2" bgColor="transparent" />
        <Controls showInteractive={false} className="!rounded-xl !overflow-hidden !shadow-md" />
        <MiniMap
          pannable
          zoomable
          className="!rounded-2xl !overflow-hidden !border !border-rim !shadow-md hidden md:block"
          nodeColor={(n) => (n.type === "human" ? "#a19ab3" : ((n.data as { unit_color?: string | null }).unit_color ?? "#7c4dff"))}
          maskColor="var(--rf-mask)"
          bgColor="rgba(255,255,255,.9)"
        />

        <Panel position="top-left" className="!m-3">
          <div className="glass rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
            {Object.entries(RELATION_STYLE).map(([key, s]) => (
              <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink">
                <span className="w-3 h-0.5 rounded" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
            <FullscreenButton expanded={expanded} onToggle={toggle} withLabel className="!h-8 !bg-surface" />
            {canEdit && (
              <>
                <span className="w-px h-5 bg-line mx-1" />
                <Button size="sm" variant="outline" icon={<Icon name="plus" size={14} />} onClick={() => setHumanPicker(true)}>
                  Manusia
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={resetPositions.isPending}
                  onClick={() => resetPositions.mutate(undefined, { onSuccess: () => setNodes(toFlowNodes({ ...graph, positions: {} })) })}
                >
                  Rapikan
                </Button>
              </>
            )}
          </div>
        </Panel>

        {!selectedRelation && !selectedGraphNode && (
          <Panel position="bottom-center" className="!mb-4 hidden sm:block">
            <div className="rounded-full bg-night/90 text-white text-xs px-4 py-2 shadow-lg backdrop-blur">
              Klik role untuk menyorot rutenya · klik garis untuk mengatur aturan{canEdit ? " · tarik titik kanan kartu untuk membuat relasi" : ""}
            </div>
          </Panel>
        )}
      </ReactFlow>

      {(selectedRelation || selectedGraphNode) && (
        <aside className="absolute top-3 right-3 bottom-3 w-[min(360px,calc(100%-24px))] glass rounded-3xl flex flex-col rise z-10" aria-label="Detail pilihan">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line/70">
            <p className="font-bold text-ink">{selectedRelation ? "Aturan relasi" : "Detail"}</p>
            <IconButton
              label="Tutup panel"
              onClick={() => {
                setSelectedEdge(null);
                setSelectedNode(null);
              }}
            >
              <Icon name="close" size={16} />
            </IconButton>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {selectedRelation ? (
              <EdgeEditor key={selectedRelation.id + selectedRelation.updated_at} relation={selectedRelation} graph={graph} canEdit={canEdit} onClose={() => setSelectedEdge(null)} />
            ) : (
              selectedGraphNode && <NodeInfo node={selectedGraphNode} graph={graph} canEdit={canEdit} onClose={() => setSelectedNode(null)} />
            )}
          </div>
        </aside>
      )}

      {pending && (
        <Modal
          isOpen
          onClose={() => setPending(null)}
          title="Relasi baru"
          maxWidth="md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setPending(null)} disabled={createRelation.isPending}>
                Batal
              </Button>
              <Button
                loading={createRelation.isPending}
                onClick={() =>
                  createRelation.mutate({ source_id: pending.source, target_id: pending.target, ...pending.form }, { onSuccess: () => setPending(null) })
                }
              >
                Buat relasi
              </Button>
            </>
          }
        >
          <RelationForm
            value={pending.form}
            onChange={(form) => setPending({ ...pending, form })}
            targetKind={nodeById(pending.target)?.kind ?? "agent"}
            sourceName={nodeById(pending.source)?.name ?? ""}
            targetName={nodeById(pending.target)?.name ?? ""}
            revisionLimit={graph.revision_limit}
          />
        </Modal>
      )}

      {humanPicker && (
        <Modal isOpen onClose={() => setHumanPicker(false)} title="Tambah manusia ke peta" description="Manusia menjadi tujuan relasi Eskalasi. Pemantau tidak bisa dipilih." maxWidth="sm">
          <ul className="space-y-1.5">
            {members
              .filter((m) => !humansOnMap.has(m.id))
              .map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => addHuman.mutate(m.id, { onSuccess: () => setHumanPicker(false) })}
                    className="w-full flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left hover:border-brand/40 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-ink">{m.value}</span>
                      <span className="block text-[11px] text-muted">{m.sub_value}</span>
                    </span>
                    <Icon name="plus" size={16} className="text-brand" />
                  </button>
                </li>
              ))}
            {members.every((m) => humansOnMap.has(m.id)) && <li className="text-sm text-faint text-center py-4">Semua anggota yang bisa memutuskan sudah ada di peta.</li>}
          </ul>
        </Modal>
      )}
    </div>
  );
}

export default function RelationMap({ graph, canEdit }: { graph: GraphInterface; canEdit: boolean }) {
  // Peta dibuat ulang bila daftar node berubah (role/manusia ditambah atau dihapus)
  const key = graph.nodes.map((n) => n.id).join("|");
  return (
    <ReactFlowProvider>
      <MapCanvas key={key} graph={graph} canEdit={canEdit} />
    </ReactFlowProvider>
  );
}

