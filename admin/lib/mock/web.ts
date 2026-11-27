/**
 * Pencarian internet per role (E1d) untuk mode data contoh. Backend memakai alat `google_search` Gemini dan
 * membuat tautan dari grounding metadata; di sini sumbernya fiktif dengan domain `.test`.
 */
import type { KnowledgeProposal, SearchHit, WebSource } from "@/app/(admin)/admin/pengetahuan/types";
import type { WebSearchMode } from "@/app/(admin)/admin/tugas/types";
import type { MockAgent, MockDatabase } from "./seed";

export interface MockProposal {
  id: string;
  organization_id: string;
  url: string;
  title: string;
  excerpt: string;
  status: KnowledgeProposal["status"];
  task_id: string | null;
  agent_id: string | null;
  proposed_by_member_id: string;
  decided_by_member_id: string | null;
  decided_at: string | null;
  document_id: string | null;
  created_at: string;
}

/** Batas pencarian internet per organisasi per hari (WEB_SEARCH_PER_DAY). */
export const WEB_SEARCH_PER_DAY = 50;
/** Skor teratas pencarian internal di bawah angka ini dianggap "dokumen kurang". */
export const WEAK_SCORE = 60;

const FRESH = /\b(terbaru|terkini|sekarang|hari ini|tahun ini|internet|tren|harga|berita|2026)\b/i;

/** Dipicu hanya bila role mengizinkan, tugas tidak mematikannya, dan dokumen internal kurang atau arahan meminta info terkini. */
export const shouldSearchWeb = (agent: MockAgent, mode: WebSearchMode, query: string, hits: SearchHit[]) =>
  agent.web_search && mode !== "off" && (FRESH.test(query) || !hits.length || hits[0].score < WEAK_SCORE);

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "topik";

/** Dua sumber fiktif yang menyebut topik tugas. */
export const simulateWebSources = (query: string, at: string): WebSource[] => {
  const topic = query.split(/\s+/).filter((w) => w.length > 3).slice(0, 5).join(" ") || "topik tugas";
  return [
    {
      no: 1,
      title: `Panduan umum: ${topic}`,
      url: `https://pustaka-terbuka.test/panduan/${slug(topic)}`,
      domain: "pustaka-terbuka.test",
      snippet: `Ringkasan praktik yang umum dipakai untuk ${topic}, termasuk contoh dan daftar periksa singkat.`,
      retrieved_at: at,
    },
    {
      no: 2,
      title: `Kabar terbaru tentang ${topic}`,
      url: `https://warta-contoh.test/2026/${slug(topic)}`,
      domain: "warta-contoh.test",
      snippet: `Perkembangan terkini terkait ${topic} per November 2026.`,
      retrieved_at: at,
    },
  ];
};

export const webSummary = (sources: WebSource[]) =>
  sources.length ? ["", "Dari internet (di luar dokumen organisasi):", ...sources.map((s) => `[W${s.no}] ${s.title} — ${s.domain}`)] : [];

export const searchesToday = (db: MockDatabase, orgId: string, now: number) => {
  const day = new Date(now).toISOString().slice(0, 10);
  return db.llm_calls.filter((c) => c.organization_id === orgId && c.purpose === "web_search" && c.created_at.startsWith(day)).length;
};

export const toProposal = (db: MockDatabase, p: MockProposal): KnowledgeProposal => {
  const name = (memberId: string | null) => {
    const m = db.memberships.find((x) => x.id === memberId);
    return m ? db.users.find((u) => u.id === m.user_id)?.full_name ?? null : null;
  };
  return {
    id: p.id,
    url: p.url,
    title: p.title,
    excerpt: p.excerpt,
    status: p.status,
    task_id: p.task_id,
    task_title: db.tasks.find((t) => t.id === p.task_id)?.title ?? null,
    agent_name: db.agents.find((a) => a.id === p.agent_id)?.name ?? null,
    proposed_by_name: name(p.proposed_by_member_id),
    decided_by_name: name(p.decided_by_member_id),
    decided_at: p.decided_at,
    document_id: p.document_id,
    created_at: p.created_at,
  };
};
