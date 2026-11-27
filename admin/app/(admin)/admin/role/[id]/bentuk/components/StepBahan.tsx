"use client";

import React, { useRef, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Textarea } from "../../../../../_components/ui";
import { Icon } from "../../../../../_components/admin-icons";
import { useResponseOptionLead } from "../../../../organisasi/unit/hooks/crud";
import { useUploadDocument } from "../../../../pengetahuan/hooks/crud";
import { ACCEPT_ATTR, STATUS_LABEL } from "../../../../pengetahuan/types";
import type { FormationInterface, MaterialsRequest } from "../../../formation-types";
import { useRunAnalysis, useSaveMaterials } from "../../../hooks/formation";

const TOOL_EXAMPLES = ["Word", "Excel", "PowerPoint", "Visual Studio Code", "JavaScript", "Canva", "Aplikasi kinerja", "ERP"];

export default function StepBahan({
  agentId,
  agentName,
  formation,
  canEdit,
  onAnalyzed,
}: {
  agentId: string;
  agentName: string;
  formation: FormationInterface;
  canEdit: boolean;
  onAnalyzed: () => void;
}) {
  const [form, setForm] = useState<MaterialsRequest>({ ...formation.materials });
  const [toolText, setToolText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { List: members, isLoading: membersLoading } = useResponseOptionLead();
  const upload = useUploadDocument();
  const save = useSaveMaterials(agentId);
  const analyse = useRunAnalysis(agentId);

  const docs = formation.material_documents;
  const processing = docs.some((d) => d.status === "queued" || d.status === "processing");
  const hasReadyDoc = docs.some((d) => d.status === "ready");
  const enoughText = form.description.trim().length >= 80;
  const dirty = JSON.stringify(form) !== JSON.stringify(formation.materials);
  const locked = !canEdit || formation.processing;

  const addTools = (raw: string) => {
    const items = raw.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
    if (!items.length) return;
    setForm((f) => ({ ...f, tools: [...new Set([...f.tools, ...items])].slice(0, 30) }));
    setToolText("");
  };

  const handleFiles = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      const body = new FormData();
      body.set("file", file);
      body.set("title", `Uraian jabatan ${agentName} – ${file.name.replace(/\.[^.]+$/, "")}`);
      body.set("doc_type", "uraian_jabatan");
      body.set("scope", "agent");
      body.set("scope_id", agentId);
      upload.mutate(body);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const runAnalysis = () => {
    const start = () => analyse.mutate({}, { onSuccess: onAnalyzed });
    if (dirty) save.mutate(form, { onSuccess: start });
    else start();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Uraian jabatan</CardTitle>
          <Badge size="sm" variant="neutral">
            PDF atau DOCX
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            Tupoksi, job description, atau SOP jabatan orang yang diwakili {agentName}. Boleh lebih dari satu berkas. Berkas
            disimpan di Pengetahuan sebagai dokumen role ini dan ikut dipakai saat bekerja.
          </p>
          {canEdit && (
            <label
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-canvas/50 px-4 py-6 text-center transition-colors ${
                locked ? "opacity-60" : "cursor-pointer hover:border-brand/50 hover:bg-brand-soft/40"
              }`}
            >
              <Icon name="book" size={22} className="text-brand" />
              <span className="text-sm font-semibold text-ink">{upload.isPending ? "Mengunggah…" : "Pilih berkas uraian jabatan"}</span>
              <span className="text-[11px] text-faint">Maksimal 20 MB per berkas</span>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                className="sr-only"
                disabled={locked}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          )}
          {docs.length ? (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/80 px-3 py-2.5">
                  <Icon name="book" size={16} className="text-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{d.title}</p>
                    <p className="text-[11px] text-faint truncate">
                      {d.file_name}
                      {d.status === "ready" ? ` · ${d.page_count} halaman` : ""}
                    </p>
                    {d.status === "processing" && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-brand-soft overflow-hidden" aria-label={`Diolah ${d.progress}%`}>
                        <div className="h-full bg-brand transition-all" style={{ width: `${d.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <Badge size="sm" variant={d.status === "ready" ? "success" : d.status === "failed" ? "danger" : "info"}>
                    {STATUS_LABEL[d.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-faint">Belum ada uraian jabatan. Analisis tetap bisa berjalan dari deskripsi bila ditulis cukup lengkap.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alat dan deskripsi pekerjaan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted">Alat, aplikasi, dan kemampuan</span>
            <div className="flex flex-wrap gap-1.5">
              {form.tools.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 h-7 pl-3 pr-1.5 rounded-full bg-brand-soft text-brand-strong text-xs font-semibold">
                  {t}
                  {!locked && (
                    <button
                      type="button"
                      aria-label={`Hapus ${t}`}
                      className="w-5 h-5 rounded-full hover:bg-brand/15 inline-flex items-center justify-center cursor-pointer"
                      onClick={() => setForm((f) => ({ ...f, tools: f.tools.filter((x) => x !== t) }))}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  )}
                </span>
              ))}
              {!form.tools.length && <span className="text-xs text-faint">Belum ada alat.</span>}
            </div>
            {!locked && (
              <>
                <Input
                  value={toolText}
                  onChange={(e) => setToolText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTools(toolText);
                    }
                  }}
                  onBlur={() => addTools(toolText)}
                  placeholder="Tulis nama alat, pisahkan dengan koma, lalu tekan Enter"
                  maxLength={300}
                />
                <div className="flex flex-wrap gap-1.5">
                  {TOOL_EXAMPLES.filter((t) => !form.tools.includes(t)).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTools(t)}
                      className="h-7 px-2.5 rounded-xl text-[11px] font-semibold bg-surface border border-line text-muted hover:text-brand hover:border-brand/40 cursor-pointer"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-faint">Nama alat tidak perlu tepat. AI memetakannya ke katalog alat MBUTI.</p>
              </>
            )}
          </div>
          <Textarea
            label="Deskripsi pekerjaan"
            rows={6}
            value={form.description}
            disabled={locked}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={`Ceritakan pekerjaan ${agentName} dengan bahasa biasa: apa yang dikerjakan, untuk siapa, seberapa sering, dan hal yang sering keliru.`}
            maxLength={4000}
            helperText={hasReadyDoc ? undefined : `${form.description.trim().length}/80 karakter minimal bila tanpa uraian jabatan`}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Orang yang diwakili"
              value={form.represented}
              disabled={locked}
              onChange={(e) => setForm({ ...form, represented: e.target.value })}
              placeholder="mis. Dimas, Pranata Humas"
              maxLength={160}
            />
            <Select
              label="Penanggung jawab"
              loading={membersLoading}
              disabled={locked}
              value={form.owner_member_id ?? ""}
              onChange={(e) => setForm({ ...form, owner_member_id: e.target.value || null })}
            >
              <option value="">— Belum ditentukan —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.value}
                </option>
              ))}
            </Select>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {processing && <span className="text-xs text-muted mr-auto">Menunggu uraian jabatan selesai diolah…</span>}
              <Button variant="outline" onClick={() => save.mutate(form)} disabled={!dirty || locked} loading={save.isPending}>
                Simpan bahan
              </Button>
              <Button
                icon={<Icon name="sparkles" size={15} />}
                onClick={runAnalysis}
                disabled={locked || processing || (!hasReadyDoc && !enoughText)}
                loading={analyse.isPending || formation.status === "analyzing"}
              >
                {formation.card ? "Analisis ulang" : "Analisis"}
              </Button>
            </div>
          )}
          {formation.card && canEdit && (
            <p className="text-[11px] text-faint text-right">Analisis ulang membuat kartu baru dan memulai tanya jawab dari awal.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
