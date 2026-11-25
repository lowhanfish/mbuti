"use client";

import React, { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Select, Textarea } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { Avatar2D } from "../../../../_components/agent/avatar-2d";
import { useTrialRole } from "../../hooks/crud";
import Link from "next/link";
import { citationText } from "../../../pengetahuan/types";
import type { InputField, ResponseInterface, TrialResult } from "../../types";

const RESULT_STYLE: Record<TrialResult["status"], { label: string; variant: "success" | "warning" | "info" }> = {
  done: { label: "Selesai", variant: "success" },
  need_info: { label: "Butuh data", variant: "warning" },
  not_in_documents: { label: "Tidak ada di dokumen", variant: "info" },
};

function InputControl({ field, value, onChange }: { field: InputField; value: string; onChange: (v: string) => void }) {
  const label = field.label;
  if (field.type === "long_text") return <Textarea label={label} required={field.required} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === "choice")
    return (
      <Select label={label} required={field.required} value={value} onChange={(e) => onChange(e.target.value)}>
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
      label={label}
      required={field.required}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function TabUjiCoba({ role }: { role: ResponseInterface }) {
  const [brief, setBrief] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [showPrompt, setShowPrompt] = useState(false);
  const trial = useTrialRole(role.id);
  const result = trial.data?.data;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Beri tugas percobaan</CardTitle>
            <p className="text-xs text-muted mt-0.5">Tidak memicu relasi dan tidak dicatat sebagai tugas.</p>
          </div>
        </CardHeader>
        <CardContent>
          {/* noValidate: isian wajib yang kosong sengaja dibiarkan agar terlihat role meminta datanya */}
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              trial.mutate({ brief, inputs });
            }}
          >
            <Textarea
              label="Arahan"
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="mis. Buatkan undangan rapat koordinasi untuk para kepala bidang."
            />
            {role.input_spec.map((field) => (
              <InputControl
                key={field.key}
                field={field}
                value={inputs[field.key] ?? ""}
                onChange={(v) => setInputs((prev) => ({ ...prev, [field.key]: v }))}
              />
            ))}
            <Button type="submit" loading={trial.isPending} icon={<Icon name="sparkles" size={16} />} className="w-full">
              Jalankan uji coba
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card glow={Boolean(result)}>
        <CardHeader>
          <CardTitle>Hasil</CardTitle>
          {result?.simulated && <Badge variant="accent">Simulasi</Badge>}
        </CardHeader>
        {trial.isPending ? (
          <div className="p-6 flex flex-col items-center gap-3 text-sm text-muted" role="status">
            <div className="animate-float">
              <Avatar2D avatar={role.avatar} size={90} />
            </div>
            {role.name} sedang bekerja…
          </div>
        ) : !result ? (
          <EmptyState
            icon={<Icon name="sparkles" size={26} />}
            title="Belum ada uji coba"
            description="Hasil, catatan, dan susunan instruksi yang dikirim ke model akan tampil di sini."
          />
        ) : (
          <CardContent className="space-y-4 rise">
            <div className="flex gap-3">
              <Avatar2D avatar={role.avatar} size={54} />
              <div className="flex-1 space-y-2">
                <Badge variant={RESULT_STYLE[result.status].variant}>{RESULT_STYLE[result.status].label}</Badge>
                <div className="rounded-2xl rounded-tl-md bg-white border border-line p-3 text-sm text-ink leading-relaxed whitespace-pre-wrap">
                  {result.output}
                </div>
                {result.notes && <p className="text-xs text-muted">{result.notes}</p>}
                {result.citations.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Rujukan</p>
                    {result.citations.map((c, i) => (
                      <Link
                        key={`${c.document_id}-${c.page_no}`}
                        href={`/admin/pengetahuan/${c.document_id}?hlm=${c.page_no}`}
                        className="flex items-center gap-2 rounded-xl bg-brand-soft/60 px-3 py-1.5 text-xs text-brand-strong hover:bg-brand-soft transition-colors"
                      >
                        <span className="w-5 h-5 rounded-md bg-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="truncate">{citationText(c.document_title, c.version_no, c.page_no)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-ink text-white/90 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPrompt((v) => !v)}
                aria-expanded={showPrompt}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold cursor-pointer hover:bg-white/5"
              >
                Susunan instruksi yang dikirim ke model
                <Icon name="chevron" size={14} className={`transition-transform ${showPrompt ? "rotate-180" : ""}`} />
              </button>
              {showPrompt && (
                <pre className="px-4 pb-4 text-[11.5px] leading-relaxed whitespace-pre-wrap font-mono text-white/80 max-h-96 overflow-auto">
                  {result.prompt_preview}
                </pre>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
