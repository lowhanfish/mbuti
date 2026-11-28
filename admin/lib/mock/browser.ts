/** Simulasi alur aplikasi luar (E4b): belajar dan putaran berjalan bertahap seiring waktu. */
import type { FlowInput, FlowStatus, FlowStep, NamedValue, RunEvent, RunMode, RunPending, RunStatus } from "@/app/(admin)/admin/alur/types";
import { newId } from "./context";
import type { MockDatabase } from "./seed";

export interface MockFlow {
  id: string;
  organization_id: string;
  agent_id: string;
  account_id: string;
  name: string;
  goal: string;
  status: FlowStatus;
  version: number;
  inputs: FlowInput[];
  steps: FlowStep[];
  note: string;
  trusted_submit: boolean;
  successful_runs: number;
  approved_at: string | null;
  approved_by_member_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MockBrowserRun {
  id: string;
  organization_id: string;
  flow_id: string;
  mode: RunMode;
  status: RunStatus;
  message: string;
  flow_version: number;
  created_by_member_id: string;
  created_at: string;
  finished_at: string | null;
  inputs: NamedValue[];
  events: RunEvent[];
  outputs: NamedValue[];
  pending: RunPending | null;
  /** Langkah yang akan dikerjakan berikutnya */
  plan: FlowStep[];
  cursor: number;
  ready_at: number;
  /** Persetujuan atau OTP untuk langkah saat ini sudah diberikan */
  cleared: boolean;
  needs_otp: boolean;
  /** Putaran milik tugas (E4c) */
  task_id?: string | null;
  /** Hasil tugas berisi buatan role: tetap minta persetujuan walau alurnya dibebaskan */
  force_approval?: boolean;
}

const STEP_MS = 1500;
const iso = (ms: number) => new Date(ms).toISOString();
const escapeXml = (value: string) => value.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Gambar pengganti tangkapan layar. */
export const mockShot = (title: string, line: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" font-family="sans-serif"><rect width="640" height="400" fill="#f6f5fb"/><rect width="640" height="56" fill="#4c1d95"/><text x="24" y="36" fill="#fff" font-size="20">${escapeXml(title.slice(0, 50))}</text><rect x="40" y="96" width="560" height="260" rx="12" fill="#fff" stroke="#ddd6fe"/><text x="64" y="140" fill="#1f2937" font-size="18">${escapeXml(line.slice(0, 58))}</text><text x="64" y="330" fill="#9ca3af" font-size="14">Tangkapan layar data contoh</text></svg>`
  )}`;

export const planSteps = (accountName: string, url: string, goal: string, inputs: FlowInput[], hasTotp: boolean): FlowStep[] => {
  const raw: Array<Omit<FlowStep, "no" | "screenshot_url">> = [
    { action: "open", description: `Buka ${url}`, value_label: "", risk: "none" },
    { action: "login", description: "Isi kolom Username", value_label: "Username (brankas)", risk: "none" },
    { action: "login", description: "Isi kolom Password", value_label: "Password (brankas)", risk: "none" },
    { action: "click", description: "Tekan tombol Masuk", value_label: "", risk: "none" },
    ...(hasTotp ? [{ action: "login" as const, description: "Isi kode authenticator", value_label: "Kode authenticator (brankas)", risk: "none" as const }] : []),
    { action: "click", description: "Buka menu yang sesuai tujuan", value_label: "", risk: "none" },
    ...inputs.map((i) => ({ action: "fill" as const, description: `Isi kolom ${i.label}`, value_label: `Isian: ${i.label}`, risk: "none" as const })),
    /hapus/i.test(goal)
      ? { action: "click" as const, description: "Tekan tombol Hapus", value_label: "", risk: "delete" as const }
      : { action: "click" as const, description: "Tekan tombol Kirim", value_label: "", risk: "submit" as const },
  ];
  return raw.map((step, i) => ({ ...step, no: i + 1, screenshot_url: mockShot(accountName, `${i + 1}. ${step.description}`) }));
};

export const startRun = (
  db: MockDatabase,
  flow: MockFlow,
  mode: RunMode,
  memberId: string,
  plan: FlowStep[],
  inputs: NamedValue[]
): MockBrowserRun => {
  const now = Date.now();
  const run: MockBrowserRun = {
    id: newId("jalan"),
    organization_id: flow.organization_id,
    flow_id: flow.id,
    mode,
    status: "queued",
    message: "",
    flow_version: flow.version,
    created_by_member_id: memberId,
    created_at: iso(now),
    finished_at: null,
    inputs,
    events: [],
    outputs: [],
    pending: null,
    plan,
    cursor: 0,
    ready_at: now + STEP_MS,
    cleared: false,
    needs_otp: mode === "replay" && /otp/i.test(flow.goal),
  };
  db.browser_runs.push(run);
  return run;
};

export const logEvent = (run: MockBrowserRun, message: string, status: RunEvent["status"], at: number, step?: FlowStep) => {
  run.events.push({
    no: run.events.length + 1,
    step_no: step?.no ?? null,
    message,
    status,
    screenshot_url: step?.screenshot_url ?? null,
    created_at: iso(at),
  });
};

export const finishRun = (run: MockBrowserRun, status: RunStatus, message: string, at: number) => {
  run.status = status;
  run.message = message;
  run.pending = null;
  run.finished_at = iso(at);
};

const advance = (db: MockDatabase, run: MockBrowserRun, flow: MockFlow, at: number) => {
  run.status = "running";
  const step = run.plan[run.cursor];
  if (!step) {
    if (run.mode === "replay") {
      flow.successful_runs += 1;
      run.outputs = [{ label: "Nomor bukti", value: `LH-2026-${String(flow.successful_runs).padStart(3, "0")}` }];
      finishRun(run, "succeeded", "Selesai. Bukti tersimpan.", at);
    } else {
      flow.steps = run.plan;
      flow.status = "review";
      flow.note = "";
      finishRun(run, "succeeded", "Alur tersusun. Periksa langkahnya lalu setujui.", at);
    }
    flow.updated_at = iso(at);
    return;
  }
  if (run.mode === "replay" && step.action === "fill" && run.inputs.some((i) => /ubah tampilan/i.test(i.value))) {
    const reason = `Langkah ${step.no} (${step.description}) tidak ditemukan. Tampilan aplikasi kemungkinan berubah.`;
    logEvent(run, reason, "failed", at, step);
    finishRun(run, "needs_repair", reason, at);
    // Seperti backend: satu percobaan perbaikan otomatis, lalu menunggu diperiksa
    Object.assign(flow, { status: "learning", note: reason, version: flow.version + 1, trusted_submit: false, successful_runs: 0, approved_at: null, approved_by_member_id: null });
    startRun(db, flow, "repair", "", run.plan, flow.inputs.map((i) => ({ label: i.label, value: i.sample })));
    return;
  }
  if (run.needs_otp && step.action === "click" && step.no > 4 && !run.cleared) {
    run.status = "waiting_otp";
    run.pending = {
      kind: "otp",
      question: "Aplikasi meminta kode OTP yang dikirim ke ponsel atau email Anda.",
      values: [],
      screenshot_url: mockShot("Verifikasi OTP", "Masukkan kode yang Anda terima"),
      expires_at: iso(at + 5 * 60_000),
    };
    logEvent(run, "Menunggu kode OTP dari pemilik.", "waiting", at, step);
    return;
  }
  if (step.risk !== "none") {
    if (run.mode !== "replay") {
      logEvent(run, `${step.description}: tidak ditekan saat belajar.`, "blocked", at, step);
      run.cursor += 1;
      run.ready_at = at + STEP_MS;
      return;
    }
    if (!run.cleared && !(step.risk === "submit" && flow.trusted_submit && !run.force_approval)) {
      run.status = "waiting_approval";
      run.pending = {
        kind: "approval",
        question: step.risk === "delete" ? `Program akan menekan "${step.description}". Data yang dihapus mungkin tidak bisa dikembalikan.` : "Isian sudah lengkap. Kirim ke aplikasi?",
        values: run.inputs,
        screenshot_url: step.screenshot_url,
        expires_at: null,
      };
      logEvent(run, "Menunggu persetujuan sebelum mengirim.", "waiting", at, step);
      return;
    }
  }
  logEvent(run, step.description, "done", at, step);
  run.cursor += 1;
  run.cleared = false;
  run.ready_at = at + STEP_MS;
};

/** Majukan semua putaran aktif sampai waktu `now`. Mengembalikan true bila ada yang berubah. */
export const advanceRuns = (db: MockDatabase, now: number) => {
  let changed = false;
  for (const run of db.browser_runs) {
    const flow = db.browser_flows.find((f) => f.id === run.flow_id);
    if (!flow) continue;
    for (let guard = 0; guard < 40 && (run.status === "queued" || run.status === "running") && now >= run.ready_at; guard++) {
      advance(db, run, flow, run.ready_at);
      changed = true;
    }
  }
  return changed;
};
