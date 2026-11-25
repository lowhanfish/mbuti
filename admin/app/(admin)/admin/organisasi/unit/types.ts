export type UnitColor = "violet" | "honey" | "pink" | "teal" | "sky" | "lime" | "orange" | "slate";

export interface CreateInterface {
  name: string;
  code: string;
  description: string;
  parent_id: string | null;
  color: UnitColor;
  lead_member_id: string | null;
  sort_order: number;
}

export interface ResponseInterface extends CreateInterface {
  id: string;
  parent_name: string | null;
  lead_name: string | null;
  member_count: number;
  agent_count: number;
  child_count: number;
  created_at: string;
  updated_at: string;
}

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
}

/** Unit beserta anak-anaknya untuk tampilan pohon. */
export interface UnitNode extends ResponseInterface {
  depth: number;
  children: UnitNode[];
}

/** Warna ruangan unit: gradasi kartu, titik warna, dan warna di kantor 3D. */
export const UNIT_COLORS: Record<UnitColor, { label: string; hex: string; gradient: string; soft: string }> = {
  violet: { label: "Ungu", hex: "#7c4dff", gradient: "from-[#9b6bff] to-[#5b2ee0]", soft: "bg-[#efe8ff] text-[#5b2ee0]" },
  honey: { label: "Madu", hex: "#ffb81c", gradient: "from-[#ffd25c] to-[#f59e0b]", soft: "bg-[#fff3d1] text-[#92580a]" },
  pink: { label: "Merah muda", hex: "#ec4899", gradient: "from-[#f472b6] to-[#c026d3]", soft: "bg-pink-100 text-pink-700" },
  teal: { label: "Hijau toska", hex: "#14b8a6", gradient: "from-[#5eead4] to-[#0d9488]", soft: "bg-teal-100 text-teal-700" },
  sky: { label: "Biru langit", hex: "#0ea5e9", gradient: "from-[#7dd3fc] to-[#0284c7]", soft: "bg-sky-100 text-sky-700" },
  lime: { label: "Hijau muda", hex: "#84cc16", gradient: "from-[#bef264] to-[#65a30d]", soft: "bg-lime-100 text-lime-700" },
  orange: { label: "Jingga", hex: "#f97316", gradient: "from-[#fdba74] to-[#ea580c]", soft: "bg-orange-100 text-orange-700" },
  slate: { label: "Abu", hex: "#64748b", gradient: "from-[#94a3b8] to-[#475569]", soft: "bg-slate-100 text-slate-700" },
};
