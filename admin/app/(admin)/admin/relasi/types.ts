import type { AvatarConfig } from "../../_components/agent/avatar-config";
import type { AgentStatus } from "../role/types";

export type RelationType = "handoff" | "review" | "consult" | "escalate";
export type RelationTrigger = "on_complete" | "on_rejected" | "on_condition";
export type PayloadSpec = "result_only" | "result_context" | "references";
export type GraphNodeKind = "agent" | "human";

/** Dipakai sebagai data node/garis React Flow, jadi ditulis sebagai `type` (bukan interface). */
export type RelationFields = {
  relation_type: RelationType;
  trigger: RelationTrigger;
  condition: string;
  payload_spec: PayloadSpec;
  expected_output: string;
  max_revisions: number;
  requires_approval: boolean;
  label: string;
}

export type CreateInterface = RelationFields & {
  source_id: string;
  /** Role tujuan (agent-…) atau manusia tujuan (member-…) untuk eskalasi */
  target_id: string;
}

export type RelationInterface = CreateInterface & {
  id: string;
  source_kind: GraphNodeKind;
  target_kind: GraphNodeKind;
  created_at: string;
  updated_at: string;
}

export type GraphAgentNode = {
  id: string;
  kind: "agent";
  name: string;
  title: string;
  status: AgentStatus;
  unit_id: string | null;
  unit_name: string | null;
  unit_color: string | null;
  avatar: AvatarConfig;
}

export type GraphHumanNode = {
  id: string;
  kind: "human";
  name: string;
  title: string;
}

export type GraphNode = GraphAgentNode | GraphHumanNode;

export interface GraphInterface {
  nodes: GraphNode[];
  relations: RelationInterface[];
  positions: Record<string, { x: number; y: number }>;
  /** Batas revisi organisasi (Pengaturan > Batas Biaya); mengalahkan max_revisions yang lebih besar */
  revision_limit: number;
}

export const RELATION_STYLE: Record<
  RelationType,
  { label: string; verb: string; hint: string; color: string; dashed: boolean; icon: string }
> = {
  handoff: {
    label: "Serahkan",
    verb: "menyerahkan hasil ke",
    hint: "Hasil diteruskan untuk dikerjakan role berikutnya.",
    color: "#7c4dff",
    dashed: false,
    icon: "flow",
  },
  review: {
    label: "Periksa",
    verb: "diperiksa oleh",
    hint: "Role tujuan menilai hasil dengan kriteria; bila perlu revisi, kembali ke pembuat.",
    color: "#f59e0b",
    dashed: false,
    icon: "approval",
  },
  consult: {
    label: "Konsultasi",
    verb: "bertanya ke",
    hint: "Meminta masukan sebelum bekerja; pekerjaan tidak berpindah.",
    color: "#14b8a6",
    dashed: true,
    icon: "users",
  },
  escalate: {
    label: "Eskalasi",
    verb: "meminta keputusan",
    hint: "Tugas berhenti dan menunggu keputusan manusia.",
    color: "#ec4899",
    dashed: true,
    icon: "shield",
  },
};

export const TRIGGER_LABEL: Record<RelationTrigger, string> = {
  on_complete: "Setelah selesai",
  on_rejected: "Bila ditolak / gagal",
  on_condition: "Bila kondisi terpenuhi",
};

/** Pemicu yang ditawarkan. `on_rejected` belum dijalankan mesin, jadi disembunyikan sampai ada. */
export const SELECTABLE_TRIGGERS: RelationTrigger[] = ["on_complete", "on_condition"];

/** Konsultasi dijalankan sebelum role sumber bekerja, bukan sesudahnya. */
export const triggerLabel = (type: RelationType, trigger: RelationTrigger) =>
  type === "consult" && trigger === "on_complete" ? "Sebelum bekerja" : TRIGGER_LABEL[trigger];

export const PAYLOAD_LABEL: Record<PayloadSpec, string> = {
  result_only: "Hasil saja",
  result_context: "Hasil + konteks tugas",
  references: "Hasil + rujukan dokumen",
};

export const emptyRelation = (type: RelationType): RelationFields => ({
  relation_type: type,
  trigger: "on_complete",
  condition: "",
  payload_spec: type === "review" ? "references" : "result_context",
  expected_output: "",
  max_revisions: 2,
  requires_approval: type === "escalate",
  label: "",
});
