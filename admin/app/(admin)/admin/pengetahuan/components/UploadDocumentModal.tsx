"use client";

import React, { useState } from "react";
import { Button, Input, Modal, Select, Textarea } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { useResponseOptionUnit } from "../../organisasi/unit/hooks/crud";
import { useResponseListRole } from "../../role/hooks/crud";
import { DOC_TYPE_LABEL, SCOPE_LABEL, type DocumentScope, type DocumentType } from "../types";
import { FileDropzone } from "./DocumentParts";

const SCOPE_HINT: Record<DocumentScope, string> = {
  organization: "Bisa dibaca semua role.",
  unit: "Bisa dibaca role di unit ini yang lingkupnya unit atau organisasi.",
  agent: "Khusus satu role; juga terbaca role lain di unitnya yang lingkupnya unit.",
};

export default function UploadDocumentModal({
  saving,
  preset,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  /** Lingkup bawaan, mis. dari tab Dokumen sebuah role */
  preset?: { scope: DocumentScope; scope_id: string | null; lock?: boolean };
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocumentType>("sop");
  const [scope, setScope] = useState<DocumentScope>(preset?.scope ?? "organization");
  const [scopeId, setScopeId] = useState<string>(preset?.scope_id ?? "");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  const { List: units } = useResponseOptionUnit();
  const { List: roles } = useResponseListRole({ search: "", unit_id: "", status: "" });

  const scopeError = touched && scope !== "organization" && !scopeId ? `Pilih ${scope === "unit" ? "unit" : "role"} pemilik dokumen.` : undefined;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!file) return setFileError("Pilih berkas yang akan diunggah.");
    if (scope !== "organization" && !scopeId) return;
    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim() || file.name.replace(/\.[^.]+$/, ""));
    form.append("doc_type", docType);
    form.append("scope", scope);
    form.append("scope_id", scope === "organization" ? "" : scopeId);
    form.append("description", description.trim());
    onSubmit(form);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Unggah dokumen"
      description="SOP, manual book, pedoman, atau templat yang menjadi dasar kerja role. Berkas diolah otomatis setelah diunggah."
      maxWidth="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" form="upload-form" loading={saving} icon={<Icon name="plus" size={16} />}>
            Unggah
          </Button>
        </>
      }
    >
      <form id="upload-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FileDropzone
          file={file}
          onFile={(f, err) => {
            setFile(f);
            setFileError(err);
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
          }}
        />
        {fileError && <p className="text-xs font-medium text-red-600 -mt-2">{fileError}</p>}

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Input label="Judul dokumen" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diambil dari nama berkas bila kosong" maxLength={200} />
          <Select
            label="Jenis"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
            options={Object.entries(DOC_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </div>

        {!preset?.lock && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted mb-2">Siapa yang boleh membaca</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(SCOPE_LABEL) as DocumentScope[]).map((s) => (
                <label
                  key={s}
                  className={`rounded-2xl border p-3 cursor-pointer transition-all ${
                    scope === s ? "border-brand bg-brand-soft/60 shadow-[0_0_0_3px_rgba(124,77,255,.12)]" : "border-line bg-white hover:border-brand/40"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={scope === s}
                    onChange={() => {
                      setScope(s);
                      setScopeId("");
                    }}
                  />
                  <span className="block text-sm font-semibold text-ink">{SCOPE_LABEL[s]}</span>
                  <span className="block text-[11px] text-muted leading-snug mt-0.5">{SCOPE_HINT[s]}</span>
                </label>
              ))}
            </div>
            {scope === "unit" && (
              <Select aria-label="Unit pemilik" value={scopeId} error={scopeError} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">— Pilih unit —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.value}
                  </option>
                ))}
              </Select>
            )}
            {scope === "agent" && (
              <Select aria-label="Role pemilik" value={scopeId} error={scopeError} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">— Pilih role —</option>
                {(roles?.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.title}
                  </option>
                ))}
              </Select>
            )}
          </fieldset>
        )}

        <Textarea label="Keterangan" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Isi singkat dokumen (opsional)" maxLength={1000} />
      </form>
    </Modal>
  );
}
