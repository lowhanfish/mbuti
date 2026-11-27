"use client";

import React, { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from "../../../../../_components/ui";
import { Icon } from "../../../../../_components/admin-icons";
import {
  FINDING_KIND_LABEL,
  TOOL_SUPPORT_LABEL,
  type FormationInterface,
  type Skill,
  type SkillCard,
  type ToolRef,
} from "../../../formation-types";
import { useSaveCard } from "../../../hooks/formation";

/** Sorotan untuk bagian kartu yang berubah pada putaran terakhir. */
const changedRing = (changed: boolean) => (changed ? "ring-2 ring-accent/70 ring-offset-2 ring-offset-canvas" : "");

export function ToolBadge({ tool }: { tool: ToolRef }) {
  const s = TOOL_SUPPORT_LABEL[tool.support];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface/80 px-2 py-1 text-[11px]"
      title={[tool.requested !== tool.name ? `Ditulis: ${tool.requested}` : "", tool.note].filter(Boolean).join(" · ") || undefined}
    >
      <span className="font-semibold text-ink">{tool.name}</span>
      <Badge size="sm" variant={s.variant}>
        {s.label}
      </Badge>
    </span>
  );
}

export function SkillView({ skill, highlight = false }: { skill: Skill; highlight?: boolean }) {
  const support = TOOL_SUPPORT_LABEL[skill.support];
  return (
    <div className={`rounded-2xl border border-line bg-surface/80 p-4 space-y-3 transition-shadow ${changedRing(highlight)}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-ink text-sm">{skill.name}</p>
          <p className="text-xs text-muted leading-relaxed mt-0.5">{skill.description}</p>
        </div>
        <Badge size="sm" variant={support.variant} dot>
          {support.label}
        </Badge>
        {highlight && (
          <Badge size="sm" variant="accent">
            Berubah
          </Badge>
        )}
      </div>
      <ol className="space-y-1">
        {skill.steps.map((st, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-ink">
            <span className="w-5 h-5 rounded-lg bg-brand-soft text-brand-strong font-bold text-[10px] flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="pt-0.5 flex-1">{st.text}</span>
            {st.approval && (
              <Badge size="sm" variant="warning">
                Persetujuan
              </Badge>
            )}
          </li>
        ))}
      </ol>
      <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
        <p className="text-muted">
          <span className="font-semibold text-ink">Bahan:</span> {skill.inputs.join(", ") || "—"}
        </p>
        <p className="text-muted">
          <span className="font-semibold text-ink">Hasil:</span> {skill.outputs.join(", ") || "—"}
        </p>
      </div>
      {skill.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skill.tools.map((t) => (
            <ToolBadge key={`${t.requested}-${t.key}`} tool={t} />
          ))}
        </div>
      )}
      {skill.substitute_note && <p className="text-[11px] text-amber-800 bg-accent-soft rounded-xl px-3 py-2">{skill.substitute_note}</p>}
    </div>
  );
}

const lines = (value: string) => value.split("\n").map((l) => l.trim()).filter(Boolean);

function SkillEditor({ skill, onChange, onRemove }: { skill: Skill; onChange: (s: Skill) => void; onRemove: () => void }) {
  return (
    <div className="rounded-2xl border border-brand/30 bg-surface p-4 space-y-3">
      <div className="flex gap-2">
        <Input label="Nama keterampilan" value={skill.name} onChange={(e) => onChange({ ...skill, name: e.target.value })} maxLength={120} />
        <Button variant="ghost" size="sm" className="self-end" icon={<Icon name="trash" size={14} />} onClick={onRemove}>
          Hapus
        </Button>
      </div>
      <Textarea label="Uraian" rows={2} value={skill.description} onChange={(e) => onChange({ ...skill, description: e.target.value })} maxLength={600} />
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-muted">Langkah kerja</span>
        {skill.steps.map((st, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={st.text}
              onChange={(e) => onChange({ ...skill, steps: skill.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
              maxLength={200}
            />
            <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                checked={st.approval}
                onChange={(e) => onChange({ ...skill, steps: skill.steps.map((x, j) => (j === i ? { ...x, approval: e.target.checked } : x)) })}
              />
              Persetujuan
            </label>
            <button
              type="button"
              aria-label="Hapus langkah"
              className="w-8 h-8 rounded-xl text-faint hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center cursor-pointer"
              onClick={() => onChange({ ...skill, steps: skill.steps.filter((_, j) => j !== i) })}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => onChange({ ...skill, steps: [...skill.steps, { text: "", approval: false }] })}>
          Tambah langkah
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Textarea label="Bahan (satu per baris)" rows={3} value={skill.inputs.join("\n")} onChange={(e) => onChange({ ...skill, inputs: lines(e.target.value) })} />
        <Textarea label="Hasil (satu per baris)" rows={3} value={skill.outputs.join("\n")} onChange={(e) => onChange({ ...skill, outputs: lines(e.target.value) })} />
        <Textarea
          label="Alat (satu per baris)"
          rows={3}
          value={skill.tools.map((t) => t.requested).join("\n")}
          onChange={(e) => onChange({ ...skill, tools: lines(e.target.value).map((requested) => ({ key: null, requested, name: requested, support: "supported", note: "" })) })}
          helperText="Dipetakan ulang saat disimpan."
        />
      </div>
    </div>
  );
}

export default function StepKartu({
  agentId,
  formation,
  canEdit,
  onNext,
}: {
  agentId: string;
  formation: FormationInterface;
  canEdit: boolean;
  onNext: () => void;
}) {
  const card = formation.card;
  const [draft, setDraft] = useState<SkillCard | null>(null);
  const saveCard = useSaveCard(agentId);

  if (!card) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <Icon name="sparkles" size={26} className="mx-auto text-brand" />
          <p className="font-bold text-ink">{formation.status === "analyzing" ? "Sedang menganalisis bahan…" : "Kartu keterampilan belum ada"}</p>
          <p className="text-xs text-muted">
            {formation.status === "analyzing"
              ? "AI membaca uraian jabatan, daftar alat, dan deskripsi. Halaman ini diperbarui sendiri."
              : "Lengkapi bahan, lalu tekan Analisis."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const editing = draft !== null;
  const changed = new Set(formation.changed);
  const locked = !canEdit || formation.processing;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Kartu keterampilan</CardTitle>
            {canEdit && !editing && (
              <Button variant="outline" size="sm" icon={<Icon name="edit" size={14} />} disabled={locked} onClick={() => setDraft(structuredClone(card))}>
                Ubah
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <Textarea label="Ringkasan tugas" rows={3} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} maxLength={1500} />
                <Textarea label="Tujuan kerja" rows={2} value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} maxLength={500} />
                {draft.skills.map((s, i) => (
                  <SkillEditor
                    key={s.key}
                    skill={s}
                    onChange={(next) => setDraft({ ...draft, skills: draft.skills.map((x, j) => (j === i ? next : x)) })}
                    onRemove={() => setDraft({ ...draft, skills: draft.skills.filter((_, j) => j !== i) })}
                  />
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Icon name="plus" size={14} />}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      skills: [
                        ...draft.skills,
                        { key: `skill-${Date.now().toString(36)}`, name: "Keterampilan baru", description: "", steps: [], inputs: [], outputs: [], tools: [], support: "supported", substitute_note: "" },
                      ],
                    })
                  }
                >
                  Tambah keterampilan
                </Button>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setDraft(null)}>
                    Batal
                  </Button>
                  <Button loading={saveCard.isPending} onClick={() => saveCard.mutate(draft, { onSuccess: () => setDraft(null) })}>
                    Simpan kartu
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className={`rounded-2xl bg-brand-soft/50 p-4 space-y-2 ${changedRing(changed.has("summary") || changed.has("goal"))}`}>
                  <p className="text-sm text-ink leading-relaxed">{card.summary}</p>
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-ink">Tujuan kerja:</span> {card.goal}
                  </p>
                </div>
                {card.skills.map((s) => (
                  <SkillView key={s.key} skill={s} highlight={changed.has(s.key) && formation.round_no > 1} />
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className={changedRing(changed.has("findings") && formation.round_no > 1)}>
          <CardHeader>
            <CardTitle>Temuan</CardTitle>
            <Badge size="sm" variant={card.findings.length ? "warning" : "success"}>
              {card.findings.length ? `${card.findings.length} hal` : "Tidak ada"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {card.findings.length ? (
              card.findings.map((f) => (
                <div key={f.id} className="rounded-2xl border border-line bg-surface/80 p-3 space-y-1">
                  <Badge size="sm" variant={f.kind === "conflict" ? "danger" : f.kind === "missing_tool" ? "warning" : "info"}>
                    {FINDING_KIND_LABEL[f.kind]}
                  </Badge>
                  <p className="text-xs text-ink leading-relaxed">{f.text}</p>
                  {f.ref && <p className="text-[11px] text-faint">Rujukan: {f.ref}</p>}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted">Bahan sudah jelas dan tidak ada yang bertentangan.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted leading-relaxed">
              Temuan dan pertanyaan dibahas di langkah tanya jawab. Alat yang belum didukung dicatat sebagai permintaan untuk pengelola MBUTI.
            </p>
            <Button className="w-full" onClick={onNext} icon={<Icon name="arrow" size={15} />}>
              Ke tanya jawab
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
