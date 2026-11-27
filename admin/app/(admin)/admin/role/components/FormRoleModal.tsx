"use client";

import React, { useState } from "react";
import { Button, Input, Modal, Select, Textarea } from "../../../_components/ui";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { Icon } from "../../../_components/admin-icons";
import { avatarFromSeed } from "../../../_components/agent/avatar-config";
import { useResponseOptionUnit } from "../../organisasi/unit/hooks/crud";
import type { CreateInterface } from "../types";

const TEMPLATES: Array<Pick<CreateInterface, "title" | "goal">> = [
  { title: "Penyusun Surat Dinas", goal: "Menyusun draf surat dinas yang sesuai pedoman tata naskah dinas, siap diperiksa." },
  { title: "Pemeriksa Dokumen", goal: "Memeriksa dokumen terhadap SOP dan memberi catatan perbaikan yang jelas." },
  { title: "Petugas Layanan Informasi", goal: "Menjawab pertanyaan berdasarkan SOP pelayanan, lengkap dengan sumbernya." },
  { title: "Perangkum Laporan", goal: "Merangkum laporan panjang menjadi poin penting untuk pimpinan." },
];

export default function FormRoleModal({
  saving,
  defaultUnitId,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  defaultUnitId: string | null;
  onClose: () => void;
  onSubmit: (body: CreateInterface) => void;
}) {
  const [form, setForm] = useState<CreateInterface>({ name: "", title: "", unit_id: defaultUnitId, goal: "", status: "draft", mode: "formation" });
  const [touched, setTouched] = useState(false);
  const { List: units, isLoading: unitsLoading } = useResponseOptionUnit();

  const nameError = touched && form.name.trim().length < 2 ? "Nama minimal 2 karakter." : undefined;
  const titleError = touched && form.title.trim().length < 3 ? "Jabatan minimal 3 karakter." : undefined;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (form.name.trim().length < 2 || form.title.trim().length < 3) return;
    onSubmit({ ...form, name: form.name.trim(), title: form.title.trim(), goal: form.goal.trim() });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Buat role baru"
      description="Isi yang pokok dulu, lalu pilih cara membentuk role."
      maxWidth="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" form="role-form" loading={saving}>
            {form.mode === "formation" ? "Buat dan mulai pembentukan" : "Buat role"}
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-[1fr_150px]" noValidate>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cara membentuk role">
            {(
              [
                ["formation", "Bentuk dengan analisis", "Disarankan. Unggah uraian jabatan dan daftar alat; AI menyusun keterampilan lalu bertanya sampai jelas."],
                ["manual", "Isi manual", "Tulis instruksi sendiri. Isian langsung menjadi versi 1."],
              ] as const
            ).map(([mode, label, hint]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={form.mode === mode}
                onClick={() => setForm({ ...form, mode })}
                className={`rounded-2xl border p-3 text-left cursor-pointer transition-colors ${form.mode === mode ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand/40"}`}
              >
                <p className="text-sm font-bold text-ink flex items-center gap-1.5">
                  {mode === "formation" && <Icon name="sparkles" size={14} className="text-brand" />}
                  {label}
                </p>
                <p className="text-[11px] text-muted leading-relaxed mt-0.5">{hint}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
            <Input
              label="Nama panggilan"
              required
              autoFocus
              value={form.name}
              error={nameError}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="mis. Rani"
              maxLength={60}
            />
            <Input
              label="Jabatan"
              required
              value={form.title}
              error={titleError}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="mis. Penyusun Surat Dinas"
              maxLength={100}
            />
          </div>
          <Select label="Unit" loading={unitsLoading} value={form.unit_id ?? ""} onChange={(e) => setForm({ ...form, unit_id: e.target.value || null })}>
            <option value="">— Belum ditempatkan —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.value}
              </option>
            ))}
          </Select>
          <Textarea
            label="Tujuan kerja"
            rows={3}
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
            placeholder={form.mode === "formation" ? "Boleh dikosongkan; disusun dari analisis." : "Apa yang harus dihasilkan role ini?"}
            maxLength={500}
          />
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted">Mulai dari contoh</span>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  type="button"
                  onClick={() => setForm({ ...form, title: t.title, goal: t.goal })}
                  className="h-8 px-3 rounded-xl text-xs font-semibold bg-surface border border-line text-muted hover:text-brand hover:border-brand/40 transition-colors cursor-pointer"
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-brand-soft to-accent-soft p-4 text-center gap-2">
          <Avatar2D avatar={avatarFromSeed(form.name || "role")} size={110} />
          <p className="font-bold text-ink text-sm leading-tight break-words max-w-full">{form.name || "Nama"}</p>
          <p className="text-[11px] text-brand leading-tight break-words max-w-full">{form.title || "Jabatan"}</p>
        </div>
      </form>
    </Modal>
  );
}
