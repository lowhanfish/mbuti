"use client";

import React, { useState } from "react";
import { Button, Input, Modal, Select, Textarea } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { MAX_FLOW_INPUTS, type FlowInput, type LearnRequest, type VaultAccountOption } from "../types";

const keyOf = (label: string, taken: Set<string>) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "isian";
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
  return key;
};

export interface FlowFormValue {
  name: string;
  goal: string;
  inputs: FlowInput[];
  account_id: string;
}

/** Mengajari alur baru, atau mempelajari ulang (akun tidak bisa diganti). */
export default function FlowFormModal({
  roleName,
  accounts,
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  roleName: string;
  accounts?: VaultAccountOption[];
  initial?: Omit<FlowFormValue, "account_id">;
  saving: boolean;
  onClose: () => void;
  onSubmit: (body: LearnRequest) => void;
}) {
  const usable = (accounts ?? []).filter((a) => !a.locked);
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [inputs, setInputs] = useState<FlowInput[]>(initial?.inputs ?? []);

  const setInput = (index: number, changes: Partial<FlowInput>) =>
    setInputs((rows) => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  const ready = name.trim().length >= 2 && goal.trim().length >= 10 && (initial || accountId) && inputs.every((i) => i.label.trim() && i.sample.trim());

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const taken = new Set<string>();
    const withKeys = inputs.map((i) => {
      const key = i.key || keyOf(i.label, taken);
      taken.add(key);
      return { key, label: i.label.trim(), sample: i.sample.trim() };
    });
    onSubmit({ account_id: accountId, name: name.trim(), goal: goal.trim(), inputs: withKeys });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="lg"
      title={initial ? "Pelajari ulang alur" : `Ajari ${roleName} alur baru`}
      description="Role menjelajahi aplikasi dan menyusun langkahnya. Tombol kirim, simpan, atau hapus tidak ditekan saat belajar."
    >
      <form className="space-y-4" onSubmit={submit}>
        {!initial && (
          <Select
            label="Akun aplikasi dari brankas"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={usable.map((a) => ({ value: a.id, label: a.name }))}
          />
        )}
        <Input label="Nama alur" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Isi laporan harian" />
        <Textarea
          label="Tujuan, dengan bahasa biasa"
          required
          rows={3}
          maxLength={1000}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Buka menu Laporan Harian, isi tanggal dan uraian kegiatan, lalu kirim."
        />

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-muted">Isian yang berganti tiap putaran</legend>
          <p className="text-[11px] text-faint">Nilai contoh dipakai saat belajar. Username, password, dan kode authenticator tidak perlu ditulis.</p>
          {inputs.map((input, i) => (
            <div key={i} className="flex gap-2 items-end">
              <Input label={i === 0 ? "Nama isian" : undefined} aria-label="Nama isian" maxLength={60} value={input.label} onChange={(e) => setInput(i, { label: e.target.value })} placeholder="Uraian" />
              <Input label={i === 0 ? "Nilai contoh" : undefined} aria-label="Nilai contoh" maxLength={500} value={input.sample} onChange={(e) => setInput(i, { sample: e.target.value })} placeholder="Contoh uraian kegiatan" />
              <Button variant="ghost" size="md" aria-label="Hapus isian" onClick={() => setInputs((rows) => rows.filter((_, n) => n !== i))}>
                <Icon name="trash" size={14} />
              </Button>
            </div>
          ))}
          {inputs.length < MAX_FLOW_INPUTS && (
            <Button variant="outline" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => setInputs((rows) => [...rows, { key: "", label: "", sample: "" }])}>
              Tambah isian
            </Button>
          )}
        </fieldset>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving} disabled={!ready}>
            Mulai belajar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
