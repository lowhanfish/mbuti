import type { DocumentVersion, IngestionStatus, PolicyFields, SearchHit, SourceKind } from "@/app/(admin)/admin/pengetahuan/types";
import type { MockAgent, MockDatabase, MockDocVersion, MockDocument } from "./seed";

/** Lama simulasi olah dokumen (ms): antre lalu diolah. */
const QUEUE_MS = 2500;
const PROCESS_MS = 7000;

export const versionStatus = (v: MockDocVersion): { status: IngestionStatus; progress: number } => {
  if (v.fail_reason) return { status: "failed", progress: 0 };
  const elapsed = Date.now() - new Date(v.processing_started_at).getTime();
  if (elapsed < QUEUE_MS) return { status: "queued", progress: 0 };
  if (elapsed < QUEUE_MS + PROCESS_MS) {
    return { status: "processing", progress: Math.round(((elapsed - QUEUE_MS) / PROCESS_MS) * 100) };
  }
  return { status: "ready", progress: 100 };
};

/** Batas halaman berat per berkas yang dibuat embedding gambarnya (PLANNING E1c). */
export const VISION_PAGES_PER_DOCUMENT = 40;

const heavyPages = (v: MockDocVersion) => v.sections.filter((s) => s.render && s.render !== "text").length;

export const toVersion = (db: MockDatabase, v: MockDocVersion): DocumentVersion => {
  const member = db.memberships.find((m) => m.id === v.uploaded_by_member_id);
  const { status, progress } = versionStatus(v);
  return {
    id: v.id,
    version_no: v.version_no,
    file_name: v.file_name,
    mime_type: v.mime_type,
    size_bytes: v.size_bytes,
    sha256: v.sha256,
    page_count: v.sections.length,
    is_active: v.is_active,
    status,
    progress,
    error_message: v.fail_reason,
    uploaded_by_name: member ? db.users.find((u) => u.id === member.user_id)?.full_name ?? null : null,
    media_kind: v.media_kind ?? (v.mime_type === "application/pdf" ? "pdf" : "text"),
    visual_pages: Math.min(VISION_PAGES_PER_DOCUMENT, heavyPages(v)),
    visual_pages_over_limit: Math.max(0, heavyPages(v) - VISION_PAGES_PER_DOCUMENT),
    created_at: v.created_at,
  };
};

/** Dokumen organisasi yang belum dihapus. */
export const liveDocuments = (db: MockDatabase, orgId: string) => db.documents.filter((d) => d.organization_id === orgId && !d.deleted_at);

/** Versi baru menggantikan versi aktif hanya setelah selesai diolah; versi yang gagal tidak pernah aktif sendiri. */
export const promoteVersions = (db: MockDatabase) => {
  let changed = false;
  const pending = db.doc_versions.filter((v) => v.activate_when_ready).sort((a, b) => a.version_no - b.version_no);
  for (const v of pending) {
    const { status } = versionStatus(v);
    if (status === "queued" || status === "processing") continue;
    v.activate_when_ready = false;
    changed = true;
    if (status !== "ready") continue;
    const siblings = db.doc_versions.filter((x) => x.document_id === v.document_id);
    if (siblings.some((x) => x.is_active && x.version_no > v.version_no)) continue;
    for (const x of siblings) x.is_active = x.id === v.id;
  }
  return changed;
};

/** Dokumen yang boleh dibaca sebuah role: dokumen seluruh organisasi selalu ikut, sisanya menurut lingkup pengetahuannya. */
export const documentsForAgent = (db: MockDatabase, agent: MockAgent): MockDocument[] => {
  // Uraian jabatan dan hasil tanya jawab hanya dibaca role pemiliknya, apa pun lingkup role lain
  const orgDocs = liveDocuments(db, agent.organization_id).filter(
    (d) => !(d.category === "formation" || d.category === "qa") || d.scope_id === agent.id
  );
  if (agent.knowledge_scope === "organization") return orgDocs;
  if (agent.knowledge_scope === "unit" && agent.unit_id) {
    const unitAgents = new Set(db.agents.filter((a) => a.unit_id === agent.unit_id).map((a) => a.id));
    return orgDocs.filter(
      (d) =>
        d.scope === "organization" ||
        (d.scope === "unit" && d.scope_id === agent.unit_id) ||
        (d.scope === "agent" && d.scope_id && unitAgents.has(d.scope_id))
    );
  }
  return orgDocs.filter((d) => d.scope === "organization" || (d.scope === "agent" && d.scope_id === agent.id));
};

/** Kebijakan dipakai hanya bila berstatus berlaku dan hari ini di dalam masa berlakunya. */
export const policyInForce = (p: PolicyFields | undefined, today = new Date().toISOString().slice(0, 10)) =>
  !p || (p.status === "berlaku" && (!p.effective_from || p.effective_from <= today) && (!p.effective_until || p.effective_until >= today));

export const sourceKindOf = (d: MockDocument): SourceKind => (d.category === "policy" ? "policy" : d.category === "qa" ? "qa" : "document");

/** Urutan rujukan (PLANNING E1b): kebijakan organisasi → hasil tanya jawab → dokumen. Internet ditambah mesin di E1d. */
const TIER: Record<SourceKind, number> = { policy: 0, qa: 1, document: 2, image: 2, attachment: 2, web: 3 };

const STOPWORDS = new Set(["yang", "dan", "untuk", "dengan", "dari", "pada", "atau", "ini", "itu", "dalam", "akan", "agar", "kami", "apa", "bagaimana", "berapa", "kapan", "buat", "buatkan", "tolong"]);

export const tokenize = (text: string) =>
  [...new Set(text.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w)))];

const snippetAround = (text: string, terms: string[]) => {
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0));
  const start = Number.isFinite(first) ? Math.max(0, first - 70) : 0;
  const slice = text.slice(start, start + 230).trim();
  return `${start > 0 ? "…" : ""}${slice}${start + 230 < text.length ? "…" : ""}`;
};

/**
 * Pencarian kata kunci sederhana pada versi aktif yang sudah siap.
 * Backend nanti memakai gabungan kata kunci (tsvector) dan kemiripan makna (pgvector).
 */
export const searchDocuments = (db: MockDatabase, docs: MockDocument[], query: string, limit = 6): SearchHit[] => {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const d of docs) {
    if (!policyInForce(d.policy)) continue;
    const v = db.doc_versions.find((x) => x.document_id === d.id && x.is_active);
    if (!v || versionStatus(v).status !== "ready") continue;
    for (const s of v.sections) {
      const hay = `${s.heading} ${s.text}`.toLowerCase();
      const matched = terms.filter((t) => hay.includes(t));
      if (!matched.length) continue;
      const frequency = matched.reduce((sum, t) => sum + hay.split(t).length - 1, 0);
      hits.push({
        document_id: d.id,
        document_title: d.title,
        version_id: v.id,
        version_no: v.version_no,
        page_no: s.page_no,
        heading: s.heading,
        snippet: snippetAround(s.text, matched),
        score: Math.round((matched.length / terms.length) * 100 + Math.min(frequency, 10)),
        source_kind: d.category === "policy" || d.category === "qa" || !s.render || s.render === "text" ? sourceKindOf(d) : "image",
        image_url: s.image_url ?? null,
      });
    }
  }
  // Ambil yang paling cocok dulu, lalu susun menurut urutan rujukan
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => TIER[a.source_kind] - TIER[b.source_kind] || b.score - a.score);
};
