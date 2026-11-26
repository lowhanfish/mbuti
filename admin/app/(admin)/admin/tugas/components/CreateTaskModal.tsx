"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { Button, Input, Modal, Select, Textarea } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { useResponseBudgetSettings } from "../../pengaturan/batas-biaya/hooks/crud";
import { LIMITS, type ResponseInterface as BudgetSettings } from "../../pengaturan/batas-biaya/types";
import { useResponseGraph } from "../../relasi/hooks/crud";
import { downstream } from "../../relasi/layout-graph";
import { RELATION_STYLE } from "../../relasi/types";
import { useResponseListRole } from "../../role/hooks/crud";
import type { InputField } from "../../role/types";
import { PRIORITY_LABEL, formatRupiah, type CreateInterface, type TaskPriority } from "../types";

function InputControl({ field, value, onChange }: { field: InputField; value: string; onChange: (v: string) => void }) {
  if (field.type === "long_text") return <Textarea label={field.label} required={field.required} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === "choice")
    return (
      <Select label={field.label} required={field.required} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Pilih —</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  return (
    <Input
      label={field.label}
      required={field.required}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Pratinjau rute: role dan manusia yang mungkin terlibat menurut peta relasi. */
function RoutePreview({ agentId, limits }: { agentId: string; limits?: BudgetSettings }) {
  const { Graph } = useResponseGraph();
  if (!Graph || !agentId) return null;
  const route = downstream(agentId, Graph.relations);
  const name = (id: string) => Graph.nodes.find((n) => n.id === id)?.name ?? id;
  const rels = Graph.relations.filter((r) => route.edges.has(r.id));

  return (
    <div className="rounded-3xl bg-gradient-to-br from-ink to-[#2d2150] text-white p-5 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Pratinjau rute</p>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="w-2 h-2 rounded-full bg-accent" />
        {name(agentId)} mengerjakan
      </div>
      {rels.length === 0 ? (
        <p className="text-xs text-white/60">Tidak ada relasi keluar: tugas selesai setelah {name(agentId)} bekerja.</p>
      ) : (
        <ol className="space-y-2 border-l border-white/15 ml-1 pl-4">
          {rels.map((r) => (
            <li key={r.id} className="text-xs leading-snug">
              <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold mr-1.5" style={{ background: RELATION_STYLE[r.relation_type].color }}>
                {RELATION_STYLE[r.relation_type].label}
              </span>
              {name(r.source_id)} → <strong>{name(r.target_id)}</strong>
              {r.relation_type === "review" && (
                <span className="text-white/50"> · maks {Math.min(r.max_revisions, Graph.revision_limit)}× revisi</span>
              )}
              {r.relation_type === "consult" && <span className="text-white/50"> · sebelum {name(r.source_id)} bekerja</span>}
              {r.trigger === "on_condition" && <span className="block text-white/50 mt-0.5">bila: {r.condition}</span>}
            </li>
          ))}
        </ol>
      )}
      <p className="text-[11px] text-white/45">Rute sebenarnya bisa lebih pendek (kondisi tidak terpenuhi) atau berulang (revisi).</p>
      {limits && (
        <dl className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
          <div>
            <dt className="text-[10px] text-white/50">Batas langkah</dt>
            <dd className="text-sm font-bold">{limits.max_steps_per_task} langkah</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/50">Sisa anggaran bulan ini</dt>
            <dd className="text-sm font-bold text-accent">{formatRupiah(limits.usage.remaining)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export default function CreateTaskModal({
  saving,
  defaultAgentId,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  defaultAgentId?: string;
  onClose: () => void;
  onSubmit: (body: CreateInterface) => void;
}) {
  const { List } = useResponseListRole({ search: "", unit_id: "", status: "active" });
  const roles = useMemo(() => List?.data ?? [], [List]);
  const [agentId, setAgentId] = useState(defaultAgentId ?? "");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueAt, setDueAt] = useState("");
  // null = belum diubah, ikut batas bawaan organisasi
  const [budgetInput, setBudgetInput] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const { Budget } = useResponseBudgetSettings();
  const budgetText = budgetInput ?? (Budget ? String(Budget.default_task_budget) : "");
  const budget = Number(budgetText);
  const maxBudget = Math.min(LIMITS.task_budget.max, Budget?.monthly_budget ?? LIMITS.task_budget.max);
  const budgetValid = Number.isInteger(budget) && budget >= LIMITS.task_budget.min && budget <= maxBudget;
  const budgetError =
    Budget && !budgetValid ? `Isi antara ${formatRupiah(LIMITS.task_budget.min)} dan ${formatRupiah(maxBudget)}.` : undefined;
  const exhausted = Boolean(Budget && Budget.usage.remaining <= 0);

  const agent = roles.find((r) => r.id === agentId);
  const missing = (agent?.input_spec ?? []).filter((f) => f.required && !inputs[f.key]?.trim()).map((f) => f.label);
  const titleError = touched && title.trim().length < 5 ? "Judul minimal 5 karakter." : undefined;

  const submit = () => {
    setTouched(true);
    if (!agent || title.trim().length < 5 || missing.length || !Budget || !budgetValid || exhausted) return;
    onSubmit({ title: title.trim(), brief: brief.trim(), entry_agent_id: agent.id, inputs, priority, due_at: dueAt || null, budget_limit: budget });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Buat tugas"
      description="Pilih role yang mengerjakan lebih dulu. Selanjutnya tugas berjalan mengikuti Peta Relasi."
      maxWidth="3xl"
      footer={
        <>
          {touched && missing.length > 0 && <span className="text-xs text-rose-600 mr-auto">Lengkapi: {missing.join(", ")}</span>}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button loading={saving} disabled={!agent || !Budget || exhausted} icon={<Icon name="sparkles" size={16} />} onClick={submit}>
            Mulai kerjakan
          </Button>
        </>
      }
    >
      {exhausted && (
        <p className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700" role="alert">
          Anggaran bulan ini sudah habis, jadi tugas baru tidak bisa dibuat.{" "}
          <Link href="/admin/pengaturan/batas-biaya" className="font-bold underline">
            Lihat batas biaya
          </Link>
        </p>
      )}

      <div className="space-y-3">
        <span className="text-xs font-semibold text-muted">Diberikan kepada</span>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Role">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={agentId === r.id}
              onClick={() => {
                setAgentId(r.id);
                setInputs({});
              }}
              className={`flex items-center gap-2 rounded-2xl border p-2 text-left transition-all cursor-pointer ${
                agentId === r.id ? "border-brand bg-brand-soft/70 shadow-[0_0_0_3px_rgba(124,77,255,.15)]" : "border-line bg-white hover:border-brand/40"
              }`}
            >
              <span className="w-10 h-10 rounded-xl flex items-end justify-center overflow-hidden shrink-0" style={{ background: `${r.unit_color ?? "#7c4dff"}2a` }}>
                <Avatar2D avatar={r.avatar} size={38} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink truncate">{r.name}</span>
                <span className="block text-[11px] text-muted truncate">{r.title}</span>
              </span>
            </button>
          ))}
          {roles.length === 0 && <p className="text-sm text-faint col-span-full">Belum ada role aktif.</p>}
        </div>
      </div>

      {agent && (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px] pt-2 rise">
          <div className="space-y-4">
            <Input label="Judul tugas" required value={title} error={titleError} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="mis. Undangan rapat koordinasi" />
            <Textarea label="Arahan" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={`Apa yang perlu dikerjakan ${agent.name}?`} maxLength={4000} />
            {agent.input_spec.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {agent.input_spec.map((f) => (
                  <div key={f.key} className={f.type === "long_text" ? "sm:col-span-2" : ""}>
                    <InputControl field={f} value={inputs[f.key] ?? ""} onChange={(v) => setInputs((prev) => ({ ...prev, [f.key]: v }))} />
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Prioritas"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                options={Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }))}
              />
              <Input label="Tenggat" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              <Input
                label="Batas biaya (Rp)"
                type="number"
                min={LIMITS.task_budget.min}
                max={maxBudget}
                step={500}
                value={budgetText}
                error={budgetError}
                onChange={(e) => setBudgetInput(e.target.value)}
                helperText={
                  Budget && budget > Budget.usage.remaining
                    ? "Melebihi sisa anggaran bulan ini; tugas bisa berhenti lebih awal."
                    : budgetInput === null
                      ? "Bawaan organisasi. Tugas berhenti bila terlampaui."
                      : "Tugas berhenti otomatis bila terlampaui."
                }
              />
            </div>
          </div>
          <RoutePreview agentId={agent.id} limits={Budget} />
        </div>
      )}
    </Modal>
  );
}
