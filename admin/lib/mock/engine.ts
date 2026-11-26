/**
 * Simulasi mesin agen untuk mode data contoh (PLANNING.md bagian 7).
 * Waktu disimulasikan: setiap permintaan memanggil advanceTasks(db, sekarang) yang memajukan langkah
 * yang sudah "jatuh tempo". Backend nanti menggantinya dengan worker Celery dan panggilan Gemini.
 */
import type { SearchHit } from "@/app/(admin)/admin/pengetahuan/types";
import type { ApprovalReason, ApprovalStatus, EventType, StepKind, StepStatus, TaskPriority, TaskStatus } from "@/app/(admin)/admin/tugas/types";
import { documentsForAgent, searchDocuments } from "./knowledge";
import { findRelation } from "./lookup";
import type { MockAgent, MockDatabase, MockRelation } from "./seed";
import { modelOption, monthUsage, settingsOf } from "./settings";

export interface MockTask {
  id: string;
  organization_id: string;
  title: string;
  brief: string;
  inputs: Record<string, string>;
  entry_agent_id: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  budget_limit: number;
  cost_used: number;
  created_by_member_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Antrean id langkah yang belum selesai, diproses berurutan */
  queue: string[];
  /** Jumlah putaran revisi per relasi Periksa */
  review_rounds: Record<string, number>;
}

export interface MockStep {
  id: string;
  task_id: string;
  agent_id: string;
  kind: StepKind;
  via_relation_id: string | null;
  parent_step_id: string | null;
  attempt_no: number;
  status: StepStatus;
  input_notes: string;
  output: string;
  citations: SearchHit[];
  verdict: "approved" | "revise" | null;
  /** Model yang dipakai; kosong selama langkah belum selesai */
  model: string;
  cost: number;
  tokens: number;
  /** Waktu (ms) langkah mulai berjalan, lalu waktu selesai saat berjalan */
  ready_at: number;
  started_at: string | null;
  finished_at: string | null;
}

export type ApprovalFollowUp = {
  /** Lahir dari relasi pemicu penolakan; bila ditolak, tidak memicu rute penolakan lagi */
  from_rejection?: boolean;
} & (
  | { type: "run_relation"; relation_id: string; from_step_id: string }
  | { type: "route_after"; step_id: string; skip_relation_id: string }
  /** Izin berkonsultasi; langkah `step_id` ditahan sampai semua izinnya diputuskan */
  | { type: "run_consult"; relation_id: string; step_id: string }
  | { type: "none" }
);

export interface MockApproval {
  id: string;
  task_id: string;
  step_id: string | null;
  reason: ApprovalReason;
  question: string;
  requested_from_member_id: string;
  status: ApprovalStatus;
  comment: string;
  decided_by_member_id: string | null;
  decided_at: string | null;
  created_at: string;
  follow_up: ApprovalFollowUp;
}

export interface MockEvent {
  id: string;
  task_id: string;
  step_id: string | null;
  type: EventType;
  message: string;
  created_at: string;
}

const QUEUE_MS = 1200;
const DURATION_MS: Record<StepKind, number> = { work: 4200, review: 3600, consult: 2400 };

let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;
const iso = (ms: number) => new Date(ms).toISOString();

const agentOf = (db: MockDatabase, agentId: string) => db.agents.find((a) => a.id === agentId);

const log = (db: MockDatabase, task: MockTask, type: EventType, message: string, at: number, stepId: string | null = null) => {
  db.task_events.push({ id: id("evt"), task_id: task.id, step_id: stepId, type, message, created_at: iso(at) });
  task.updated_at = iso(at);
};

const addStep = (
  db: MockDatabase,
  task: MockTask,
  fields: Pick<MockStep, "agent_id" | "kind" | "via_relation_id" | "parent_step_id" | "attempt_no" | "input_notes">,
  at: number
) => {
  const step: MockStep = {
    id: id("step"),
    task_id: task.id,
    ...fields,
    status: "queued",
    output: "",
    citations: [],
    verdict: null,
    model: "",
    cost: 0,
    tokens: 0,
    ready_at: at + QUEUE_MS,
    started_at: null,
    finished_at: null,
  };
  db.task_steps.push(step);
  task.queue.push(step.id);
  return step;
};

const memberName = (db: MockDatabase, memberId: string) =>
  db.users.find((u) => u.id === db.memberships.find((m) => m.id === memberId)?.user_id)?.full_name ?? "manusia";

/** Model yang dipakai sebuah role menurut Pengaturan > Model AI. */
const modelFor = (db: MockDatabase, agent: MockAgent) => modelOption(settingsOf(db, agent.organization_id).models[agent.model_profile]);

/** Biaya simulasi (rupiah) menurut model dan banyaknya rujukan. */
const simulatedCost = (modelStepCost: number, hits: number, attempt: number) => modelStepCost + attempt * 30 + hits * 15;

const taskQuery = (task: MockTask, step: MockStep) => [task.title, task.brief, ...Object.values(task.inputs), step.input_notes].join(" ");

/** Masukan konsultasi yang pernah diterima role ini dalam tugas yang sama. */
const adviceFor = (db: MockDatabase, step: MockStep) => {
  const own = new Set(db.task_steps.filter((s) => s.task_id === step.task_id && s.agent_id === step.agent_id).map((s) => s.id));
  return db.task_steps
    .filter((s) => s.kind === "consult" && s.status === "done" && s.parent_step_id && own.has(s.parent_step_id))
    .map((s) => s.output);
};

const workOutput = (agent: MockAgent, task: MockTask, step: MockStep, hits: SearchHit[], advice: string[]) => {
  const lines = [`${agent.title} — hasil simulasi${step.attempt_no > 1 ? ` (perbaikan ke-${step.attempt_no - 1})` : ""}`, ""];
  for (const f of agent.input_spec) if (task.inputs[f.key]) lines.push(`${f.label}: ${task.inputs[f.key]}`);
  if (agent.input_spec.length) lines.push("");
  lines.push(task.brief || task.title);
  if (step.input_notes) lines.push("", `Catatan yang diperhatikan: ${step.input_notes}`);
  if (advice.length) lines.push("", "Masukan konsultasi yang dipakai:", ...advice.map((a) => `- ${a}`));
  if (hits.length) {
    lines.push("", "Aturan yang dipakai:");
    hits.forEach((h, i) => lines.push(`[${i + 1}] ${h.heading} — ${h.snippet.slice(0, 140)}`));
  } else {
    lines.push("", "Tidak ditemukan aturan di dokumen dalam lingkup role; bagian yang tidak diatur ditandai untuk dilengkapi manusia.");
  }
  lines.push("", "Pada fase backend, bagian ini berisi hasil kerja yang ditulis Gemini.");
  return lines.join("\n");
};

const reviewOutput = (reviewer: MockAgent, maker: MockAgent, verdict: "approved" | "revise", hits: SearchHit[]) => {
  if (verdict === "revise") {
    const h = hits[0];
    return [
      `Pemeriksaan oleh ${reviewer.name} atas hasil ${maker.name}`,
      "",
      "Temuan:",
      h ? `1. ${h.heading}: ${h.snippet.slice(0, 120)} — belum diterapkan sepenuhnya [1].` : "1. Beberapa bagian belum menyebut dasar aturannya.",
      "2. Bagian penutup perlu disesuaikan dengan susunan baku.",
      "",
      "Keputusan: PERLU REVISI",
    ].join("\n");
  }
  return [
    `Pemeriksaan oleh ${reviewer.name} atas hasil ${maker.name}`,
    "",
    ...(maker.acceptance_criteria.length ? maker.acceptance_criteria.map((c) => `✓ ${c}`) : ["✓ Sesuai aturan yang dirujuk"]),
    "",
    "Keputusan: DITERIMA",
  ].join("\n");
};

/** Relasi bersyarat dianggap terpenuhi bila kata penting dari kondisinya muncul di judul atau arahan tugas (simulasi). */
const conditionMet = (rel: MockRelation, task: MockTask) => {
  const hay = `${task.title} ${task.brief} ${Object.values(task.inputs).join(" ")}`.toLowerCase();
  return rel.condition
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 6)
    .some((w) => hay.includes(w));
};

/** Penanggung jawab role; pembuat tugas bila kosong, nonaktif, atau pemantau (tidak boleh memutuskan). */
const ownerOf = (db: MockDatabase, agentId: string, task: MockTask) => {
  const owner = db.memberships.find((m) => m.id === agentOf(db, agentId)?.owner_member_id);
  return owner && owner.status === "active" && owner.access_role !== "viewer" ? owner.id : task.created_by_member_id;
};

const requestApproval = (
  db: MockDatabase,
  task: MockTask,
  fields: Pick<MockApproval, "step_id" | "reason" | "question" | "requested_from_member_id" | "follow_up">,
  at: number
) => {
  db.approvals.push({ id: id("apv"), task_id: task.id, ...fields, status: "pending", comment: "", decided_by_member_id: null, decided_at: null, created_at: iso(at) });
  log(db, task, "approval_requested", `Menunggu keputusan ${memberName(db, fields.requested_from_member_id)}: ${fields.question}`, at, fields.step_id);
};

const runConsult = (db: MockDatabase, task: MockTask, rel: MockRelation, asker: MockStep, at: number) =>
  addStep(db, task, { agent_id: rel.target_id, kind: "consult", via_relation_id: rel.id, parent_step_id: asker.id, attempt_no: 1, input_notes: rel.expected_output }, at);

/**
 * Antrekan langkah kerja atau periksa. Konsultasi milik role itu dijalankan lebih dulu agar masukannya terpakai.
 * Bila ada konsultasi yang perlu izin, langkahnya ditahan di luar antrean sampai semua izin diputuskan.
 */
const queueStep = (db: MockDatabase, task: MockTask, fields: Parameters<typeof addStep>[2], at: number) => {
  const step = addStep(db, task, fields, at);
  const consults = db.relations.filter(
    (r) => r.organization_id === task.organization_id && r.source_id === step.agent_id && r.relation_type === "consult" && r.trigger !== "on_rejected"
  );
  const applicable = consults.filter((rel) => {
    if (rel.trigger !== "on_condition" || conditionMet(rel, task)) return true;
    log(db, task, "relation_skipped", `Kondisi tidak terpenuhi, relasi "${rel.label || rel.relation_type}" dilewati: ${rel.condition}`, at, step.id);
    return false;
  });
  if (!applicable.length) return;

  task.queue.splice(task.queue.indexOf(step.id), 1);
  for (const rel of applicable.filter((r) => !r.requires_approval)) runConsult(db, task, rel, step, at);
  const gated = applicable.filter((r) => r.requires_approval);
  for (const rel of gated) {
    requestApproval(
      db,
      task,
      {
        step_id: step.id,
        reason: "requires_approval",
        question: `Boleh ${agentOf(db, rel.source_id)?.name} berkonsultasi dengan ${agentOf(db, rel.target_id)?.name} sebelum bekerja?`,
        requested_from_member_id: ownerOf(db, rel.source_id, task),
        follow_up: { type: "run_consult", relation_id: rel.id, step_id: step.id },
      },
      at
    );
  }
  if (!gated.length) task.queue.push(step.id);
};

/** Jalankan relasi Periksa atau Serahkan setelah langkah `from`. */
const runRelation = (db: MockDatabase, task: MockTask, rel: MockRelation, from: MockStep, at: number) => {
  const source = agentOf(db, rel.source_id);
  if (rel.relation_type === "review") {
    queueStep(db, task, { agent_id: rel.target_id, kind: "review", via_relation_id: rel.id, parent_step_id: from.id, attempt_no: 1, input_notes: rel.expected_output }, at);
  } else if (rel.relation_type === "handoff") {
    queueStep(
      db,
      task,
      { agent_id: rel.target_id, kind: "work", via_relation_id: rel.id, parent_step_id: from.id, attempt_no: 1, input_notes: `Diserahkan oleh ${source?.name}: ${rel.expected_output}` },
      at
    );
  }
};

type RouteTrigger = "complete" | "rejected";

/** Relasi keluar yang berlaku. Konsultasi sudah dijalankan sebelum role itu bekerja (lihat queueStep). */
const outgoing = (db: MockDatabase, task: MockTask, agentId: string, trigger: RouteTrigger) =>
  db.relations.filter(
    (r) =>
      r.organization_id === task.organization_id &&
      r.source_id === agentId &&
      r.relation_type !== "consult" &&
      (r.trigger === "on_rejected") === (trigger === "rejected")
  );

/** Jalankan relasi keluar dari sebuah langkah yang selesai atau ditolak. */
const route = (db: MockDatabase, task: MockTask, from: MockStep, at: number, skipRelationId: string | null = null, trigger: RouteTrigger = "complete") => {
  const rels = outgoing(db, task, from.agent_id, trigger).filter((r) => r.id !== skipRelationId);
  const origin = trigger === "rejected" ? { from_rejection: true } : {};
  for (const rel of rels) {
    if (rel.trigger === "on_condition" && !conditionMet(rel, task)) {
      log(db, task, "relation_skipped", `Kondisi tidak terpenuhi, relasi "${rel.label || rel.relation_type}" dilewati: ${rel.condition}`, at, from.id);
      continue;
    }
    if (rel.relation_type === "escalate") {
      requestApproval(
        db,
        task,
        { step_id: from.id, reason: "escalate", question: rel.expected_output || rel.label || "Mohon keputusan atas hasil ini.", requested_from_member_id: rel.target_id, follow_up: { type: "none", ...origin } },
        at
      );
    } else if (rel.requires_approval) {
      requestApproval(
        db,
        task,
        {
          step_id: from.id,
          reason: "requires_approval",
          question: `Boleh lanjut "${rel.label || rel.relation_type}" ke ${agentOf(db, rel.target_id)?.name}?`,
          requested_from_member_id: ownerOf(db, rel.source_id, task),
          follow_up: { type: "run_relation", relation_id: rel.id, from_step_id: from.id, ...origin },
        },
        at
      );
    } else {
      runRelation(db, task, rel, from, at);
    }
  }
};

const pendingApprovals = (db: MockDatabase, task: MockTask) => db.approvals.filter((a) => a.task_id === task.id && a.status === "pending");

const settle = (db: MockDatabase, task: MockTask, at: number) => {
  if (task.queue.length) {
    task.status = "running";
  } else if (pendingApprovals(db, task).length) {
    task.status = "waiting_approval";
  } else {
    task.status = "completed";
    task.completed_at = iso(at);
    log(db, task, "completed", "Tugas selesai.", at);
  }
};

/** Lewati semua langkah yang belum selesai, termasuk yang ditahan menunggu izin. */
const skipPendingSteps = (db: MockDatabase, task: MockTask) => {
  for (const s of db.task_steps) if (s.task_id === task.id && (s.status === "queued" || s.status === "running")) s.status = "skipped";
  task.queue = [];
};

/** Hentikan tugas oleh pengaman: langkah yang antre dilewati dan permintaan persetujuan ditutup. */
const halt = (db: MockDatabase, task: MockTask, status: "failed" | "stopped_budget", message: string, at: number, stepId: string | null = null) => {
  skipPendingSteps(db, task);
  for (const a of pendingApprovals(db, task)) {
    a.status = "rejected";
    a.comment = "Tugas dihentikan otomatis.";
  }
  task.status = status;
  log(db, task, status, message, at, stepId);
};

const finishStep = (db: MockDatabase, task: MockTask, step: MockStep, at: number) => {
  const agent = agentOf(db, step.agent_id);
  if (!agent) {
    step.status = "failed";
    step.finished_at = iso(at);
    return;
  }
  const hits = searchDocuments(db, documentsForAgent(db, agent), taskQuery(task, step), 4);
  step.citations = hits;
  const model = modelFor(db, agent);
  step.model = model.id;
  step.cost = simulatedCost(model.estimated_step_cost, hits.length, step.attempt_no);
  step.tokens = Math.round(step.cost * 4.2);
  step.finished_at = iso(at);
  step.status = "done";
  task.cost_used += step.cost;

  if (step.kind === "work") {
    step.output = workOutput(agent, task, step, hits, adviceFor(db, step));
    log(db, task, "step_done", `${agent.name} menyelesaikan pekerjaan.`, at, step.id);
  } else if (step.kind === "consult") {
    step.output = `Masukan dari ${agent.name}: ${hits[0] ? `${hits[0].heading} — ${hits[0].snippet.slice(0, 160)}` : "tidak ada aturan khusus di dokumen saya untuk hal ini."}`;
    log(db, task, "step_done", `${agent.name} memberi masukan.`, at, step.id);
  }

  if (task.cost_used > task.budget_limit) {
    halt(db, task, "stopped_budget", "Biaya mencapai batas tugas. Tugas dihentikan otomatis.", at, step.id);
    return;
  }

  if (step.kind === "review") {
    const rel = findRelation(db, step.via_relation_id);
    const makerStep = db.task_steps.find((s) => s.id === step.parent_step_id);
    const maker = makerStep ? agentOf(db, makerStep.agent_id) : undefined;
    const rounds = rel ? (task.review_rounds[rel.id] ?? 0) : 0;
    // Simulasi: pemeriksaan pertama selalu meminta revisi, berikutnya diterima
    step.verdict = rounds === 0 ? "revise" : "approved";
    const advice = adviceFor(db, step);
    step.output = [
      reviewOutput(agent, maker ?? agent, step.verdict, hits),
      ...(advice.length ? ["", "Masukan konsultasi yang dipakai:", ...advice.map((a) => `- ${a}`)] : []),
    ].join("\n");
    if (step.verdict === "revise" && rel && makerStep && maker) {
      task.review_rounds[rel.id] = rounds + 1;
      makerStep.status = "revise_requested";
      // Batas organisasi mengalahkan batas relasi bila lebih kecil
      const limit = Math.min(rel.max_revisions, settingsOf(db, task.organization_id).max_revisions);
      const round = limit ? `putaran ${rounds + 1} dari maks ${limit}` : "revisi otomatis dimatikan";
      log(db, task, "review_revise", `${agent.name} meminta revisi (${round}).`, at, step.id);
      if (rounds + 1 > limit) {
        requestApproval(
          db,
          task,
          {
            step_id: step.id,
            reason: "max_revisions",
            question: limit
              ? `Batas ${limit}× revisi antara ${maker.name} dan ${agent.name} habis. Terima hasil terakhir?`
              : `${agent.name} meminta revisi, tetapi revisi otomatis dimatikan. Terima hasil ${maker.name}?`,
            requested_from_member_id: ownerOf(db, maker.id, task),
            follow_up: { type: "route_after", step_id: step.id, skip_relation_id: rel.id },
          },
          at
        );
      } else {
        addStep(
          db,
          task,
          { agent_id: maker.id, kind: "work", via_relation_id: null, parent_step_id: step.id, attempt_no: makerStep.attempt_no + 1, input_notes: `Catatan ${agent.name}: perbaiki temuan pemeriksaan.` },
          at
        );
      }
    } else {
      log(db, task, "review_approved", `${agent.name} menerima hasil${maker ? ` ${maker.name}` : ""}.`, at, step.id);
      route(db, task, step, at);
    }
    return;
  }

  if (step.kind === "work") route(db, task, step, at);
};

/** Majukan semua tugas yang aktif sampai waktu `now`. Mengembalikan true bila ada yang berubah. */
export const advanceTasks = (db: MockDatabase, now: number) => {
  let changed = false;
  for (const task of db.tasks) {
    if (task.status !== "queued" && task.status !== "running") continue;
    for (let guard = 0; guard < 50; guard++) {
      const step = db.task_steps.find((s) => s.id === task.queue[0]);
      if (!step) {
        settle(db, task, now);
        changed = true;
        break;
      }
      if (step.status === "queued") {
        if (now < step.ready_at) break;
        const settings = settingsOf(db, task.organization_id);
        const stepsSoFar = db.task_steps.filter((s) => s.task_id === task.id && s.started_at).length;
        if (stepsSoFar >= settings.max_steps_per_task) {
          halt(db, task, "failed", `Batas ${settings.max_steps_per_task} langkah tercapai. Tugas dihentikan untuk mencegah putaran tanpa akhir.`, step.ready_at);
          changed = true;
          break;
        }
        if (monthUsage(db, task.organization_id, step.ready_at).used >= settings.monthly_budget) {
          halt(db, task, "stopped_budget", "Anggaran bulanan organisasi habis. Tugas dihentikan sebelum langkah berikutnya.", step.ready_at);
          changed = true;
          break;
        }
        step.status = "running";
        step.started_at = iso(step.ready_at);
        task.status = "running";
        log(db, task, "step_started", `${agentOf(db, step.agent_id)?.name} mulai ${step.kind === "review" ? "memeriksa" : step.kind === "consult" ? "memberi masukan" : "bekerja"}.`, step.ready_at, step.id);
        step.ready_at += DURATION_MS[step.kind];
        changed = true;
        continue;
      }
      if (step.status === "running") {
        if (now < step.ready_at) break;
        const at = step.ready_at;
        task.queue.shift();
        finishStep(db, task, step, at);
        // Langkah berikutnya baru mulai setelah langkah ini selesai
        for (const nextId of task.queue) {
          const next = db.task_steps.find((s) => s.id === nextId);
          if (next && next.status === "queued" && next.ready_at < at + QUEUE_MS) next.ready_at = at + QUEUE_MS;
        }
        changed = true;
        if (task.status === "running" || task.status === "queued") {
          if (!task.queue.length) {
            settle(db, task, at);
            break;
          }
          continue;
        }
        break;
      }
      // Langkah yang tidak lagi aktif dikeluarkan dari antrean
      task.queue.shift();
      changed = true;
    }
  }
  return changed;
};

export const createTask = (
  db: MockDatabase,
  fields: Pick<MockTask, "organization_id" | "title" | "brief" | "inputs" | "entry_agent_id" | "priority" | "due_at" | "budget_limit" | "created_by_member_id">,
  at: number
) => {
  const task: MockTask = {
    id: id("task"),
    ...fields,
    status: "queued",
    cost_used: 0,
    created_at: iso(at),
    updated_at: iso(at),
    completed_at: null,
    queue: [],
    review_rounds: {},
  };
  db.tasks.push(task);
  log(db, task, "created", `Tugas dibuat oleh ${memberName(db, fields.created_by_member_id)} untuk ${agentOf(db, fields.entry_agent_id)?.name}.`, at);
  queueStep(db, task, { agent_id: fields.entry_agent_id, kind: "work", via_relation_id: null, parent_step_id: null, attempt_no: 1, input_notes: "" }, at);
  return task;
};

export const decideApproval = (
  db: MockDatabase,
  approval: MockApproval,
  decision: "approved" | "rejected" | "revise",
  comment: string,
  memberId: string,
  at: number
) => {
  const task = db.tasks.find((t) => t.id === approval.task_id);
  if (!task) return;
  approval.status = decision;
  approval.comment = comment;
  approval.decided_by_member_id = memberId;
  approval.decided_at = iso(at);
  const who = memberName(db, memberId);
  const label = decision === "approved" ? "menyetujui" : decision === "rejected" ? "menolak" : "meminta revisi";
  log(db, task, "approval_decided", `${who} ${label}${comment ? `: "${comment}"` : "."}`, at, approval.step_id);

  const step = db.task_steps.find((s) => s.id === approval.step_id);
  const follow = approval.follow_up;
  // Pembuat hasil: untuk langkah pemeriksaan, langkah yang diperiksa
  const makerStep = step?.kind === "review" ? db.task_steps.find((s) => s.id === step.parent_step_id) ?? step : step;

  if (decision === "rejected") {
    // Relasi "bila ditolak" milik pembuat hasil mengambil alih; tanpa itu tugas gagal
    if (makerStep && follow.type !== "run_consult" && !follow.from_rejection && outgoing(db, task, makerStep.agent_id, "rejected").length) {
      route(db, task, makerStep, at, null, "rejected");
    } else {
      task.status = "failed";
      skipPendingSteps(db, task);
      for (const a of pendingApprovals(db, task)) {
        a.status = "rejected";
        a.comment = "Tugas ditolak pada persetujuan lain.";
        a.decided_at = iso(at);
      }
      log(db, task, "failed", "Tugas ditolak dan dihentikan.", at);
      return;
    }
  } else if (follow.type === "run_consult") {
    // "Minta revisi" berarti: kerjakan tanpa konsultasi ini, dengan catatan
    const rel = db.relations.find((r) => r.id === follow.relation_id);
    if (step && decision === "approved" && rel) runConsult(db, task, rel, step, at);
    if (step && decision === "revise") step.input_notes = [step.input_notes, `Catatan ${who}: ${comment}`].filter(Boolean).join(" ");
    const stillGated = pendingApprovals(db, task).some((a) => a.follow_up.type === "run_consult" && a.follow_up.step_id === follow.step_id);
    if (step && !stillGated) {
      step.ready_at = at + QUEUE_MS;
      task.queue.push(step.id);
    }
  } else if (decision === "revise" && step && makerStep) {
    // Revisi dikerjakan ulang oleh role pembuat hasil terakhir
    addStep(
      db,
      task,
      { agent_id: makerStep.agent_id, kind: "work", via_relation_id: null, parent_step_id: step.id, attempt_no: makerStep.attempt_no + 1, input_notes: `Catatan ${who}: ${comment || "perbaiki hasil."}` },
      at
    );
  } else if (decision === "approved") {
    const f = approval.follow_up;
    if (f.type === "run_relation") {
      const rel = db.relations.find((r) => r.id === f.relation_id);
      const from = db.task_steps.find((s) => s.id === f.from_step_id);
      if (rel && from) runRelation(db, task, rel, from, at);
    } else if (f.type === "route_after") {
      const from = db.task_steps.find((s) => s.id === f.step_id);
      if (from) route(db, task, from, at, f.skip_relation_id);
    }
  }
  settle(db, task, at);
};

export const cancelTask = (db: MockDatabase, task: MockTask, memberId: string, at: number) => {
  skipPendingSteps(db, task);
  for (const a of pendingApprovals(db, task)) {
    a.status = "rejected";
    a.comment = "Tugas dihentikan.";
  }
  task.status = "cancelled";
  log(db, task, "cancelled", `Tugas dihentikan oleh ${memberName(db, memberId)}.`, at);
};
