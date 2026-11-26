"use client";

import React, { useMemo, useState } from "react";
import { Button, Input, Modal, Select, Textarea } from "../../../../_components/ui";
import { useResponseOptionLead } from "../hooks/crud";
import { blockedParentIds, buildTree, flattenTree } from "../tree";
import { UNIT_COLORS, type CreateInterface, type ResponseInterface, type UnitColor } from "../types";

export const emptyUnit = (parent_id: string | null = null): CreateInterface => ({
  name: "",
  code: "",
  description: "",
  parent_id,
  color: "violet",
  lead_member_id: null,
  sort_order: 0,
});

export const unitToForm = (u: ResponseInterface): CreateInterface => ({
  name: u.name,
  code: u.code,
  description: u.description,
  parent_id: u.parent_id,
  color: u.color,
  lead_member_id: u.lead_member_id,
  sort_order: u.sort_order,
});

export default function FormUnitModal({
  isOpen,
  mode,
  editingId,
  initial,
  allUnits,
  saving,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  mode: "add" | "edit";
  editingId: string | null;
  initial: CreateInterface;
  allUnits: ResponseInterface[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (body: CreateInterface) => void;
}) {
  const [form, setForm] = useState<CreateInterface>(initial);
  const [touched, setTouched] = useState(false);
  const { List: leadOptions, isLoading: leadLoading } = useResponseOptionLead();

  const parentOptions = useMemo(() => {
    const blocked = editingId ? blockedParentIds(allUnits, editingId) : new Set<string>();
    return flattenTree(buildTree(allUnits))
      .filter((u) => !blocked.has(u.id))
      .map((u) => ({ value: u.id, label: `${"— ".repeat(u.depth)}${u.name}` }));
  }, [allUnits, editingId]);

  const set = <K extends keyof CreateInterface>(key: K, value: CreateInterface[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const nameError = touched && form.name.trim().length < 2 ? "Nama unit minimal 2 karakter." : undefined;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (form.name.trim().length < 2) return;
    onSubmit({ ...form, name: form.name.trim(), code: form.code.trim().toUpperCase() });
  };

  const palette = UNIT_COLORS[form.color];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "add" ? "Tambah unit" : "Ubah unit"}
      description="Unit adalah divisi tempat role AI bekerja. Di kantor 3D, setiap unit menjadi satu ruangan."
      maxWidth="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" form="unit-form" loading={saving}>
            {mode === "add" ? "Tambah unit" : "Simpan"}
          </Button>
        </>
      }
    >
      <form id="unit-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_200px]" noValidate>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Input
              label="Nama unit"
              required
              autoFocus
              value={form.name}
              error={nameError}
              onChange={(e) => set("name", e.target.value)}
              placeholder="mis. Persuratan"
              maxLength={120}
            />
            <Input
              label="Kode"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="SRT"
              maxLength={12}
            />
          </div>
          <Textarea
            label="Tugas unit"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Apa yang dikerjakan unit ini?"
            maxLength={1000}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Unit induk" value={form.parent_id ?? ""} onChange={(e) => set("parent_id", e.target.value || null)}>
              <option value="">— Tidak ada (unit utama) —</option>
              {parentOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Select
              label="Penanggung jawab"
              loading={leadLoading}
              value={form.lead_member_id ?? ""}
              onChange={(e) => set("lead_member_id", e.target.value || null)}
              helperText="Manusia yang menyetujui hasil kerja unit."
            >
              <option value="">— Belum ditentukan —</option>
              {leadOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.value}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <span className="text-xs font-semibold text-muted">Warna ruangan</span>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Warna ruangan">
            {(Object.keys(UNIT_COLORS) as UnitColor[]).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={form.color === key}
                aria-label={UNIT_COLORS[key].label}
                title={UNIT_COLORS[key].label}
                onClick={() => set("color", key)}
                className={`h-9 rounded-xl bg-gradient-to-br ${UNIT_COLORS[key].gradient} transition-all cursor-pointer ${
                  form.color === key ? "ring-2 ring-offset-2 ring-ink scale-105" : "opacity-80 hover:opacity-100 hover:scale-105"
                }`}
              />
            ))}
          </div>
          <div className={`rounded-2xl p-4 bg-gradient-to-br ${palette.gradient} text-white shadow-lg transition-all`}>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{form.code || "KODE"}</span>
            <p className="font-bold leading-tight mt-1 break-words">{form.name || "Nama unit"}</p>
            <p className="text-[11px] opacity-80 mt-2">Pratinjau papan ruangan</p>
          </div>
          <Input
            label="Urutan"
            type="number"
            min={0}
            value={String(form.sort_order)}
            onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
          />
        </div>
      </form>
    </Modal>
  );
}
