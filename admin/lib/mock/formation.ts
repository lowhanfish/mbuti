/**
 * Simulasi pembentukan role (E1a) untuk mode data contoh.
 * Analisis dan tiap putaran tanya jawab "berjalan" beberapa detik, lalu advanceFormations() menulis hasilnya,
 * seperti worker Celery yang memanggil Gemini di backend. Isinya dibuat dari bahan dengan aturan sederhana.
 */
import type {
  CardFinding,
  FormationInterface,
  FormationMaterials,
  FormationMessage,
  MaterialDocument,
  RevisionSnapshot,
  RevisionSource,
  RevisionStatus,
  Skill,
  SkillCard,
  ToolRef,
  VersionDetailInterface,
  VersionInterface,
} from "@/app/(admin)/admin/role/formation-types";
import type { InputField } from "@/app/(admin)/admin/role/types";
import { versionStatus } from "./knowledge";
import type { MockAgent, MockDatabase } from "./seed";
import { mapTool, weakestSupport } from "./tools";

export interface MockRevision {
  id: string;
  organization_id: string;
  agent_id: string;
  version_no: number;
  status: RevisionStatus;
  source: RevisionSource;
  materials: FormationMaterials;
  card: SkillCard | null;
  snapshot: RevisionSnapshot;
  round_no: number;
  messages: FormationMessage[];
  changed: string[];
  agent_satisfied: boolean;
  change_note: string;
  finalized_at: string | null;
  finalized_by_member_id: string | null;
  error_message: string | null;
  /** Pekerjaan latar yang sedang berjalan dan kapan selesainya (ms) */
  pending: { kind: "analysis" | "round"; until: number; finish?: boolean } | null;
  created_at: string;
  updated_at: string;
}

export interface MockToolRequest {
  id: string;
  organization_id: string;
  agent_id: string;
  revision_id: string;
  skill_name: string;
  requested: string;
  status: "open" | "planned" | "done" | "declined";
  created_at: string;
}

export const ANALYSIS_MS = 4500;
export const ROUND_MS = 3000;
export const MAX_ROUNDS = 6;
const QUESTIONS_PER_ROUND = 5;

let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;
const iso = (ms: number) => new Date(ms).toISOString();

export const OPEN_STATUSES: RevisionStatus[] = ["draft", "analyzing", "questioning", "ready"];

export const snapshotOf = (a: MockAgent): RevisionSnapshot => ({
  goal: a.goal,
  instructions: a.instructions,
  input_spec: structuredClone(a.input_spec),
  output_format: a.output_format,
  output_template: a.output_template,
  acceptance_criteria: [...a.acceptance_criteria],
  knowledge_scope: a.knowledge_scope,
  model_profile: a.model_profile,
  web_search: a.web_search,
  compose_mode: a.compose_mode,
});

export const revisionsOf = (db: MockDatabase, agentId: string) =>
  db.agent_revisions.filter((r) => r.agent_id === agentId).sort((a, b) => b.version_no - a.version_no);

export const openRevision = (db: MockDatabase, agentId: string) => revisionsOf(db, agentId).find((r) => OPEN_STATUSES.includes(r.status)) ?? null;

export const activeRevision = (db: MockDatabase, agent: MockAgent) => db.agent_revisions.find((r) => r.id === agent.active_revision_id) ?? null;

const memberName = (db: MockDatabase, memberId: string | null) => {
  const m = db.memberships.find((x) => x.id === memberId);
  return m ? db.users.find((u) => u.id === m.user_id)?.full_name ?? null : null;
};

/** Uraian jabatan role ini (dokumen berjenis `uraian_jabatan` berlingkup role). */
export const materialDocuments = (db: MockDatabase, agentId: string): MaterialDocument[] =>
  db.documents
    .filter((d) => !d.deleted_at && d.scope === "agent" && d.scope_id === agentId && d.doc_type === "uraian_jabatan")
    .map((d) => {
      const v = db.doc_versions.find((x) => x.document_id === d.id && x.is_active) ?? db.doc_versions.find((x) => x.document_id === d.id);
      const s = v ? versionStatus(v) : { status: "failed" as const, progress: 0 };
      return { id: d.id, title: d.title, file_name: v?.file_name ?? "", status: s.status, progress: s.progress, page_count: v?.sections.length ?? 0 };
    });

const materialText = (db: MockDatabase, agentId: string) =>
  materialDocuments(db, agentId)
    .filter((m) => m.status === "ready")
    .flatMap((m) => {
      const v = db.doc_versions.find((x) => x.document_id === m.id && x.is_active);
      return (v?.sections ?? []).map((s) => ({ title: m.title, page: s.page_no, text: `${s.heading}\n${s.text}` }));
    });

const openRequired = (rev: MockRevision) => {
  const answered = new Set(rev.messages.filter((m) => m.kind === "answer").map((m) => m.question_id));
  return rev.messages.filter((m) => m.kind === "question" && m.required && !answered.has(m.id)).length;
};

export const toFormation = (db: MockDatabase, rev: MockRevision, canEdit = true): FormationInterface => ({
  id: rev.id,
  agent_id: rev.agent_id,
  version_no: rev.version_no,
  status: rev.status,
  source: rev.source,
  processing: rev.pending !== null,
  can_edit: canEdit,
  materials: rev.materials,
  material_documents: materialDocuments(db, rev.agent_id),
  card: rev.card,
  snapshot: rev.card ? rev.snapshot : null,
  round_no: rev.round_no,
  messages: rev.messages,
  open_required: openRequired(rev),
  changed: rev.changed,
  agent_satisfied: rev.agent_satisfied,
  error_message: rev.error_message,
  created_at: rev.created_at,
  updated_at: rev.updated_at,
});

export const toVersion = (db: MockDatabase, rev: MockRevision, agent: MockAgent): VersionInterface => ({
  id: rev.id,
  version_no: rev.version_no,
  status: rev.status,
  source: rev.source,
  change_note: rev.change_note,
  finalized_at: rev.finalized_at,
  finalized_by_name: memberName(db, rev.finalized_by_member_id),
  is_active: agent.active_revision_id === rev.id,
  skill_count: rev.card?.skills.length ?? 0,
  question_count: rev.messages.filter((m) => m.kind === "question").length,
});

export const toVersionDetail = (db: MockDatabase, rev: MockRevision, agent: MockAgent): VersionDetailInterface => ({
  ...toVersion(db, rev, agent),
  snapshot: rev.snapshot,
  card: rev.card,
});

// ---------------------------------------------------------------------------------------------------------------
// Analisis

const VERBS = /\b(menyusun|membuat|memeriksa|mengisi|merekap|melaporkan|menjawab|mendesain|merancang|mengelola|mengolah|menyiapkan|memverifikasi|mengarsipkan|memantau|menginput|mengunggah|menganalisis|membalas|mengirim|mencatat)\b/i;

const sentenceCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Kalimat tugas dari uraian jabatan dan deskripsi: baris berpoin atau kalimat yang diawali kata kerja tugas. */
const dutySentences = (sources: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of sources) {
    for (const raw of source.split(/\n|(?<=\.)\s+/)) {
      const line = raw.replace(/^\s*([-*•]|\d+[.)])\s*/, "").replace(/\.$/, "").trim();
      // Baris berlabel seperti "Ikhtisar: …" atau "Unit kerja: …" bukan tugas
      if (line.length < 12 || line.length > 220 || !VERBS.test(line) || /^[A-Z][\w ]{2,25}:/.test(line)) continue;
      const key = line.toLowerCase().slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out;
};

/** Kata sambung tempat nama keterampilan dipotong, agar tidak berhenti di tengah anak kalimat. */
const CONNECTORS = new Set(["yang", "dari", "agar", "untuk", "sesuai", "dengan", "kepada", "ke", "sebelum", "setelah", "terhadap", "setiap", "bila"]);

const skillName = (sentence: string) => {
  const from = sentence.search(VERBS);
  const words = sentence.slice(Math.max(0, from)).split(/\s+/).slice(0, 7);
  const cut = words.findIndex((w, i) => i >= 2 && CONNECTORS.has(w.toLowerCase()));
  return sentenceCase((cut > 0 ? words.slice(0, cut) : words).join(" ").replace(/[,;:]$/, ""));
};

const outputOf = (name: string) => {
  const rest = name.split(/\s+/).slice(1).join(" ");
  return rest ? sentenceCase(rest) : "Hasil kerja";
};

const buildSkill = (sentence: string, index: number, tools: ToolRef[]): Skill => {
  const name = skillName(sentence);
  const output = outputOf(name);
  return {
    key: `skill-${index + 1}`,
    name,
    description: sentenceCase(sentence),
    steps: [
      { text: "Terima tugas dan periksa bahan yang dilampirkan", approval: false },
      { text: "Cari aturan, contoh, dan hasil tanya jawab di pengetahuan role", approval: false },
      { text: `Susun ${output.toLowerCase()}`, approval: false },
      { text: "Serahkan ke penanggung jawab untuk disetujui", approval: true },
    ],
    inputs: ["Arahan tugas"],
    outputs: [output],
    tools,
    support: weakestSupport(tools),
    substitute_note: tools.filter((t) => t.support === "substitute").map((t) => t.note).join(" "),
  };
};

/** Bagi alat yang disebut ke keterampilan yang kalimatnya menyebutnya; sisanya ke keterampilan pertama. */
const assignTools = (sentences: string[], tools: ToolRef[]) => {
  const buckets: ToolRef[][] = sentences.map(() => []);
  for (const tool of tools) {
    const word = tool.requested.toLowerCase();
    const at = sentences.findIndex((s) => s.toLowerCase().includes(word));
    buckets[at >= 0 ? at : 0].push(tool);
  }
  return buckets;
};

const CONFLICT = /(tanpa persetujuan|langsung (di)?kirim|kirim langsung|tidak perlu (diperiksa|disetujui))/i;

const analyse = (db: MockDatabase, agent: MockAgent, rev: MockRevision): { card: SkillCard; questions: Array<Omit<FormationMessage, "id" | "round_no" | "created_at" | "author_name">> } => {
  const docs = materialText(db, agent.id);
  const description = rev.materials.description;
  let sentences = dutySentences([...docs.map((d) => d.text), description]).slice(0, 5);
  if (!sentences.length) sentences = [`Menyusun hasil kerja utama sebagai ${agent.title}`, "Melaporkan hasil kerja ke penanggung jawab"];
  const tools = rev.materials.tools.map(mapTool);
  const buckets = assignTools(sentences, tools);
  const skills = sentences.map((s, i) => buildSkill(s, i, buckets[i]));
  const ref = docs.length ? `${docs[0].title}, hlm. ${docs[0].page}` : "";

  const findings: CardFinding[] = [];
  findings.push({ id: id("find"), kind: "unclear", text: `Frekuensi dan tenggat "${skills[0].name}" belum disebut.`, ref });
  if (!docs.length) findings.push({ id: id("find"), kind: "missing_material", text: "Belum ada uraian jabatan; analisis hanya dari deskripsi.", ref: "" });
  for (const t of tools.filter((x) => x.support === "unsupported")) {
    findings.push({ id: id("find"), kind: "missing_tool", text: `${t.requested} belum ada di katalog alat. ${t.note}`, ref: "" });
  }
  const conflict = CONFLICT.test(description);
  if (conflict) {
    findings.push({
      id: id("find"),
      kind: "conflict",
      text: "Deskripsi meminta hasil dikirim langsung, sedangkan langkah kerja mewajibkan persetujuan penanggung jawab.",
      ref: "Deskripsi pekerjaan",
    });
  }

  const goal = agent.goal || `Mengerjakan tugas ${agent.title.toLowerCase()} sesuai uraian jabatan, dengan hasil yang siap disetujui.`;
  const card: SkillCard = {
    summary: `${agent.name} bekerja sebagai ${agent.title}${rev.materials.represented ? ` mewakili ${rev.materials.represented}` : ""}. Ditemukan ${skills.length} keterampilan dari ${docs.length ? "uraian jabatan dan deskripsi" : "deskripsi"}.`,
    goal,
    skills,
    findings,
  };

  const questions: Array<Omit<FormationMessage, "id" | "round_no" | "created_at" | "author_name">> = [];
  const q = (text: string, required: boolean) =>
    questions.push({ author: "agent", kind: "question", question_id: null, required, text, skipped: false });
  if (conflict) {
    questions.push({
      author: "agent",
      kind: "objection",
      question_id: null,
      required: false,
      text: "Saya keberatan mengirim hasil tanpa persetujuan: langkah kerja di uraian jabatan mewajibkan pemeriksaan penanggung jawab.",
      skipped: false,
    });
    q("Mana yang dipakai: hasil dikirim langsung, atau tetap disetujui penanggung jawab lebih dulu?", true);
  }
  q(`Hasil "${skills[0].name.toLowerCase()}" dikirim ke siapa, dan formatnya seperti apa?`, true);
  q(`Seberapa sering "${skills[0].name.toLowerCase()}" dikerjakan, dan kapan tenggatnya?`, true);
  for (const t of tools.filter((x) => x.support === "unsupported").slice(0, 1)) {
    q(`${t.requested} belum didukung. Bagian itu tetap dikerjakan manusia, atau ada cara lain yang biasa dipakai?`, false);
  }
  q("Ada contoh hasil yang dianggap bagus? Bila ada, unggah di tab Dokumen agar saya bisa menirunya.", false);
  return { card, questions: questions.slice(0, QUESTIONS_PER_ROUND + 1) };
};

/** Rancangan isian kerja dari kartu dan tanya jawab. */
const composeSnapshot = (rev: MockRevision, base: RevisionSnapshot): RevisionSnapshot => {
  if (!rev.card) return base;
  const qa = qaPairs(rev);
  const instructions = [
    ...rev.card.skills.flatMap((s, i) => [
      `${i + 1}. ${s.name}`,
      ...s.steps.map((st) => `   - ${st.text}${st.approval ? " (tunggu persetujuan)" : ""}`),
    ]),
    ...(qa.length ? ["", "Kesepakatan dari tanya jawab:", ...qa.map((p) => `- ${p.question} → ${p.answer}`)] : []),
    "",
    "Bila aturan tidak ada di dokumen, katakan; jangan menebak.",
  ].join("\n");
  const inputs = [...new Set(rev.card.skills.flatMap((s) => s.inputs))].slice(0, 6);
  const input_spec: InputField[] = inputs.map((label, i) => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `isian_${i + 1}`,
    label,
    type: i === 0 ? "long_text" : "short_text",
    required: i === 0,
  }));
  const criteria = [
    ...rev.card.skills.slice(0, 4).map((s) => `${s.outputs[0] ?? s.name} sesuai aturan organisasi`),
    "Setiap aturan yang dipakai menyebut sumbernya",
  ];
  return {
    ...base,
    goal: rev.card.goal.slice(0, 500),
    instructions: instructions.slice(0, 8000),
    input_spec: base.input_spec.length ? base.input_spec : input_spec,
    acceptance_criteria: base.acceptance_criteria.length ? base.acceptance_criteria : criteria.slice(0, 15),
  };
};

/** Pasangan pertanyaan dan jawaban yang tidak dilewati. */
export const qaPairs = (rev: MockRevision) =>
  rev.messages
    .filter((m) => m.kind === "question")
    .flatMap((question) => {
      const answer = rev.messages.find((m) => m.kind === "answer" && m.question_id === question.id && !m.skipped);
      return answer ? [{ question: question.text, answer: answer.text, round: question.round_no }] : [];
    });

const pushQuestions = (rev: MockRevision, items: Array<Omit<FormationMessage, "id" | "round_no" | "created_at" | "author_name">>, at: number, agentName: string) => {
  for (const item of items) {
    const message: FormationMessage = { ...item, id: id("msg"), round_no: rev.round_no, created_at: iso(at), author_name: agentName };
    if (message.kind === "question") message.question_id = message.id;
    rev.messages.push(message);
  }
};

const logCall = (db: MockDatabase, rev: MockRevision, cost: number, at: number) => {
  db.llm_calls.push({ id: id("call"), organization_id: rev.organization_id, agent_id: rev.agent_id, model: "gemini-4-hydrogen", cost, purpose: "formation", created_at: iso(at) });
};

const runAnalysis = (db: MockDatabase, agent: MockAgent, rev: MockRevision, at: number) => {
  const { card, questions } = analyse(db, agent, rev);
  rev.card = card;
  rev.round_no = 1;
  rev.changed = ["summary", "goal", "findings", ...card.skills.map((s) => s.key)];
  pushQuestions(rev, questions, at, agent.name);
  rev.snapshot = composeSnapshot(rev, rev.snapshot);
  rev.status = "questioning";
  for (const skill of card.skills) {
    for (const tool of skill.tools.filter((t) => t.support === "unsupported")) {
      if (db.tool_requests.some((r) => r.agent_id === agent.id && r.requested.toLowerCase() === tool.requested.toLowerCase())) continue;
      db.tool_requests.push({
        id: id("toolreq"),
        organization_id: rev.organization_id,
        agent_id: agent.id,
        revision_id: rev.id,
        skill_name: skill.name,
        requested: tool.requested,
        status: "open",
        created_at: iso(at),
      });
    }
  }
  logCall(db, rev, 120, at);
};

/** Masukkan jawaban ke kartu: jawaban pertanyaan "dikirim ke siapa" menjadi langkah kirim, dan seterusnya. */
const applyAnswers = (rev: MockRevision) => {
  if (!rev.card) return;
  const changed = new Set<string>();
  const latest = rev.messages.filter((m) => m.kind === "answer" && !m.skipped && m.round_no === rev.round_no);
  for (const answer of latest) {
    const question = rev.messages.find((m) => m.id === answer.question_id);
    if (!question) continue;
    const skill = rev.card.skills.find((s) => question.text.toLowerCase().includes(s.name.toLowerCase())) ?? rev.card.skills[0];
    if (/dikirim ke siapa/i.test(question.text)) {
      skill.steps.push({ text: `Kirim hasil: ${answer.text}`, approval: false });
      changed.add(skill.key);
    } else if (/seberapa sering/i.test(question.text)) {
      skill.description = `${skill.description}. Jadwal: ${answer.text}`;
      rev.card.findings = rev.card.findings.filter((f) => f.kind !== "unclear");
      changed.add(skill.key);
      changed.add("findings");
    } else if (/mana yang dipakai/i.test(question.text)) {
      rev.card.findings = rev.card.findings.filter((f) => f.kind !== "conflict");
      rev.card.summary = `${rev.card.summary} Keputusan pembuat: ${answer.text}`;
      changed.add("findings");
      changed.add("summary");
    } else if (/belum didukung/i.test(question.text)) {
      skill.substitute_note = answer.text;
      changed.add(skill.key);
    } else if (/bahan .* tidak lengkap/i.test(question.text)) {
      skill.steps.splice(1, 0, { text: `Bila bahan kurang: ${answer.text}`, approval: false });
      changed.add(skill.key);
    }
  }
  const notes = rev.messages.filter((m) => m.kind === "note" && m.round_no === rev.round_no);
  if (notes.length) {
    rev.card.summary = `${rev.card.summary} Catatan pembuat: ${notes.map((n) => n.text).join(" ")}`;
    changed.add("summary");
  }
  rev.changed = [...changed];
};

const runRound = (db: MockDatabase, agent: MockAgent, rev: MockRevision, at: number, finish: boolean) => {
  applyAnswers(rev);
  rev.snapshot = composeSnapshot(rev, rev.snapshot);
  logCall(db, rev, 90, at);
  if (finish || rev.round_no >= 2 || rev.round_no >= MAX_ROUNDS) {
    rev.round_no += 1;
    rev.agent_satisfied = true;
    rev.status = "ready";
    pushQuestions(
      rev,
      [{ author: "agent", kind: "note", question_id: null, required: false, text: "Terima kasih, rancangan saya sudah jelas. Silakan periksa isian kerja lalu tekan Final.", skipped: false }],
      at,
      agent.name
    );
    return;
  }
  rev.round_no += 1;
  const skill = rev.card?.skills[1] ?? rev.card?.skills[0];
  pushQuestions(
    rev,
    [
      { author: "agent", kind: "question", question_id: null, required: true, text: `Bila bahan untuk "${skill?.name.toLowerCase() ?? "tugas"}" tidak lengkap, saya berhenti dan bertanya, atau melengkapi sendiri lalu menandainya?`, skipped: false },
      { author: "agent", kind: "question", question_id: null, required: false, text: "Siapa yang saya hubungi bila penanggung jawab sedang cuti?", skipped: false },
    ],
    at,
    agent.name
  );
  rev.status = "questioning";
};

/** Majukan analisis dan putaran tanya jawab yang sudah jatuh tempo. */
export const advanceFormations = (db: MockDatabase, now: number) => {
  let changed = false;
  for (const rev of db.agent_revisions) {
    if (!rev.pending || rev.pending.until > now) continue;
    const agent = db.agents.find((a) => a.id === rev.agent_id);
    const job = rev.pending;
    rev.pending = null;
    changed = true;
    if (!agent) continue;
    if (job.kind === "analysis") runAnalysis(db, agent, rev, job.until);
    else runRound(db, agent, rev, job.until, Boolean(job.finish));
    rev.updated_at = iso(job.until);
  }
  return changed;
};

// ---------------------------------------------------------------------------------------------------------------
// Membuat revisi

export const newRevision = (
  db: MockDatabase,
  agent: MockAgent,
  fields: { source: RevisionSource; status: RevisionStatus; base?: MockRevision | null; memberId: string; at: string }
): MockRevision => {
  const previous = revisionsOf(db, agent.id)[0];
  const base = fields.base ?? null;
  const rev: MockRevision = {
    id: id("rev"),
    organization_id: agent.organization_id,
    agent_id: agent.id,
    version_no: (previous?.version_no ?? 0) + 1,
    status: fields.status,
    source: fields.source,
    materials: base ? structuredClone(base.materials) : { description: "", tools: [], represented: "", owner_member_id: agent.owner_member_id },
    card: base?.card ? structuredClone(base.card) : null,
    snapshot: base ? structuredClone(base.snapshot) : snapshotOf(agent),
    round_no: 0,
    messages: [],
    changed: [],
    agent_satisfied: false,
    change_note: "",
    finalized_at: null,
    finalized_by_member_id: null,
    error_message: null,
    pending: null,
    created_at: fields.at,
    updated_at: fields.at,
  };
  db.agent_revisions.push(rev);
  return rev;
};

/** Jadikan revisi Final: salin isian kerja ke role, versi lama menjadi riwayat. */
export const finalize = (db: MockDatabase, agent: MockAgent, rev: MockRevision, memberId: string, note: string, at: string) => {
  for (const other of db.agent_revisions.filter((r) => r.agent_id === agent.id && r.status === "final")) other.status = "superseded";
  rev.status = "final";
  rev.pending = null;
  rev.change_note = note;
  rev.finalized_at = at;
  rev.finalized_by_member_id = memberId;
  rev.updated_at = at;
  Object.assign(agent, structuredClone(rev.snapshot), { active_revision_id: rev.id, updated_at: at });
  if (rev.materials.owner_member_id) agent.owner_member_id = rev.materials.owner_member_id;
};

/** Revisi manual yang langsung Final, dipakai saat isian kerja diubah langsung di tab Instruksi atau Profil. */
export const recordManualVersion = (db: MockDatabase, agent: MockAgent, memberId: string, note: string, at: string) => {
  const rev = newRevision(db, agent, { source: "manual", status: "final", base: activeRevision(db, agent), memberId, at });
  rev.snapshot = snapshotOf(agent);
  finalize(db, agent, rev, memberId, note, at);
  return rev;
};

/** Versi 1 untuk role contoh yang dibuat sebelum E1. */
export const seedRevisions = (db: MockDatabase, at: string) => {
  for (const agent of db.agents) {
    if (agent.active_revision_id || db.agent_revisions.some((r) => r.agent_id === agent.id)) continue;
    const rev = newRevision(db, agent, { source: "manual", status: "final", memberId: agent.owner_member_id ?? "member-demo", at });
    rev.id = `rev-${agent.id}-1`;
    finalize(db, agent, rev, agent.owner_member_id ?? "member-demo", "Dibuat sebelum pembentukan role (isian manual).", at);
  }
};

/** Hasil tanya jawab menjadi pengetahuan role (dokumen sistem, hanya-baca); versi sebelumnya diarsipkan. */
export const writeQaDocument = (db: MockDatabase, agent: MockAgent, rev: MockRevision, at: string) => {
  const pairs = qaPairs(rev);
  if (!pairs.length) return;
  for (const d of db.documents.filter((x) => x.category === "qa" && x.scope_id === agent.id && !x.deleted_at)) d.deleted_at = at;
  const docId = id("doc");
  db.documents.push({
    id: docId,
    organization_id: agent.organization_id,
    title: `Hasil tanya jawab – ${agent.name} v${rev.version_no}`,
    description: `Disusun otomatis saat versi ${rev.version_no} Final.`,
    doc_type: "lainnya",
    category: "qa",
    scope: "agent",
    scope_id: agent.id,
    created_at: at,
    updated_at: at,
  });
  db.doc_versions.push({
    id: `${docId}-v1`,
    document_id: docId,
    version_no: 1,
    file_name: `tanya-jawab-${agent.name.toLowerCase()}-v${rev.version_no}.md`,
    mime_type: "text/markdown",
    size_bytes: pairs.reduce((n, p) => n + p.question.length + p.answer.length, 0),
    sha256: `qa-${rev.id}`,
    is_active: true,
    processing_started_at: at,
    fail_reason: null,
    uploaded_by_member_id: rev.finalized_by_member_id,
    sections: pairs.map((p, i) => ({ page_no: i + 1, heading: `Pertanyaan ${i + 1}`, text: `${p.question}\n\nJawaban: ${p.answer}` })),
    created_at: at,
  });
};
