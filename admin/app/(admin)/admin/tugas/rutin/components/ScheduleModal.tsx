"use client";

import React, { useMemo, useState } from "react";
import { Button, Input, Modal, Select, Textarea } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { useResponseBudgetSettings } from "../../../pengaturan/batas-biaya/hooks/crud";
import { LIMITS } from "../../../pengaturan/batas-biaya/types";
import { useResponseCalendar } from "../../../pengaturan/kalender/hooks/crud";
import { useResponseListRole } from "../../../role/hooks/crud";
import { InputControl } from "../../components/CreateTaskModal";
import { PRIORITY_LABEL, formatRupiah, type TaskPriority, type WebSearchMode } from "../../types";
import { useParseSchedule, useResponsePreview, useSaveSchedule } from "../hooks/crud";
import { emptyRule, todayIso, type CreateScheduleRequest, type ScheduleItem, type ScheduleRule } from "../types";
import OccurrenceList from "./OccurrenceList";
import RuleForm from "./RuleForm";

export default function ScheduleModal({ editing, onClose, onSaved }: { editing?: ScheduleItem; onClose: () => void; onSaved?: (id: string) => void }) {
  const { List, isLoading: rolesLoading } = useResponseListRole({ search: "", unit_id: "", status: "active" });
  const roles = useMemo(() => List?.data ?? [], [List]);
  const { Calendar } = useResponseCalendar();
  const { Budget } = useResponseBudgetSettings();
  const parse = useParseSchedule();
  const save = useSaveSchedule();

  const [sentence, setSentence] = useState(editing?.source_text ?? "");
  const [notes, setNotes] = useState<string[]>([]);
  const [rule, setRule] = useState<ScheduleRule>(editing?.rule ?? emptyRule(todayIso()));
  const [agentId, setAgentId] = useState(editing?.entry_agent.id ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [brief, setBrief] = useState(editing?.brief ?? "");
  const [inputs, setInputs] = useState<Record<string, string>>(editing?.inputs ?? {});
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? "normal");
  const [webSearch, setWebSearch] = useState<WebSearchMode>(editing?.web_search ?? "role");
  const [budgetInput, setBudgetInput] = useState<string | null>(editing ? String(editing.budget_limit) : null);
  const [touched, setTouched] = useState(false);

  const { Preview, error: ruleError } = useResponsePreview(rule, agentId);
  const agent = roles.find((r) => r.id === agentId);
  const budgetText = budgetInput ?? (Budget ? String(Budget.default_task_budget) : "");
  const budget = Number(budgetText);
  const budgetValid = Number.isInteger(budget) && budget >= LIMITS.task_budget.min && budget <= LIMITS.task_budget.max;
  const missing = (agent?.input_spec ?? []).filter((f) => f.required && !inputs[f.key]?.trim()).map((f) => f.label);
  const titleError = touched && title.trim().length < 5 ? "Judul minimal 5 karakter." : undefined;
  const problem = !agent ? "Pilih role." : missing.length ? `Lengkapi: ${missing.join(", ")}` : ruleError;

  const understand = () =>
    parse.mutate(sentence.trim(), {
      onSuccess: (res) => {
        setRule(res.data.rule);
        setNotes(res.data.notes);
        if (!title.trim()) setTitle(res.data.title);
      },
    });

  const submit = (status: CreateScheduleRequest["status"]) => {
    setTouched(true);
    if (!agent || problem || title.trim().length < 5 || !budgetValid) return;
    save.mutate(
      {
        id: editing?.id,
        body: {
          title: title.trim(),
          brief: brief.trim(),
          entry_agent_id: agent.id,
          inputs,
          priority,
          budget_limit: budget,
          web_search: webSearch,
          rule,
          source_text: sentence.trim(),
          status,
        },
      },
      {
        onSuccess: (res) => {
          onClose();
          onSaved?.(res.data.id);
        },
      }
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editing ? "Ubah tugas rutin" : "Buat tugas rutin"}
      description="Tulis jadwalnya dengan bahasa biasa, periksa putaran berikutnya, lalu aktifkan."
      maxWidth="3xl"
      footer={
        <>
          {touched && problem && <span className="text-xs text-rose-600 mr-auto">{problem}</span>}
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button variant="outline" disabled={save.isPending} onClick={() => submit("draft")}>
            Simpan draf
          </Button>
          <Button loading={save.isPending} disabled={!Budget} icon={<Icon name="check" size={16} />} onClick={() => submit("active")}>
            Aktifkan
          </Button>
        </>
      }
    >
      <div className="rounded-3xl bg-brand-soft/60 border border-rim p-4 space-y-3">
        <Textarea
          label="Jadwal dengan bahasa biasa"
          rows={2}
          maxLength={500}
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="mis. Isi laporan harian setiap Senin–Jumat pukul 16.05, jangan saat libur"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="dark" icon={<Icon name="sparkles" size={15} />} loading={parse.isPending} disabled={sentence.trim().length < 8} onClick={understand}>
            Pahami jadwal
          </Button>
          <span className="text-[11px] text-muted">Hasilnya bisa dibetulkan pada formulir di bawah.</span>
        </div>
        {notes.length > 0 && (
          <ul className="text-xs text-amber-800 list-disc pl-5 space-y-0.5">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <RuleForm rule={rule} shifts={Calendar?.shifts ?? []} onChange={setRule} />
        <div className="rounded-3xl border border-line bg-surface p-4 space-y-3 self-start">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Putaran berikutnya</p>
          {ruleError ? (
            <p className="text-xs text-rose-600" role="alert">
              {ruleError}
            </p>
          ) : (
            Preview && (
              <>
                <p className="text-sm font-semibold text-ink">{Preview.rule_text}</p>
                <OccurrenceList items={Preview.occurrences} />
              </>
            )
          )}
        </div>
      </div>

      <div className="border-t border-line pt-4 space-y-3">
        <p className="text-xs font-bold text-ink">Tugas yang dibuat setiap putaran</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Role"
            required
            loading={rolesLoading}
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setInputs({});
            }}
          >
            <option value="">— Pilih role aktif —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.title}
              </option>
            ))}
          </Select>
          <Input label="Judul tugas" required maxLength={150} value={title} error={titleError} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Laporan harian" />
        </div>
        <Textarea label="Arahan" rows={3} maxLength={4000} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Apa yang dikerjakan setiap putaran?" />
        {agent && agent.input_spec.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {agent.input_spec.map((f) => (
              <div key={f.key} className={f.type === "long_text" ? "sm:col-span-2" : ""}>
                <InputControl field={f} value={inputs[f.key] ?? ""} onChange={(v) => setInputs((prev) => ({ ...prev, [f.key]: v }))} />
              </div>
            ))}
          </div>
        )}
        {agent?.web_search && (
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" className="accent-[#7c4dff]" checked={webSearch === "off"} onChange={(e) => setWebSearch(e.target.checked ? "off" : "role")} />
            Tanpa internet untuk tugas ini
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Prioritas" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} options={Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }))} />
          <Input
            label="Batas biaya per putaran (Rp)"
            type="number"
            step={500}
            value={budgetText}
            error={Budget && !budgetValid ? `Isi antara ${formatRupiah(LIMITS.task_budget.min)} dan ${formatRupiah(LIMITS.task_budget.max)}.` : undefined}
            onChange={(e) => setBudgetInput(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
