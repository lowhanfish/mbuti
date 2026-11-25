"use client";

import React, { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Textarea } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { SECTOR_OPTIONS, TIMEZONE_OPTIONS, type ResponseInterface, type UpdateInterface } from "../types";

const pick = (p: ResponseInterface): UpdateInterface => ({
  name: p.name,
  description: p.description,
  sector: p.sector,
  timezone: p.timezone,
  email: p.email,
  phone: p.phone,
  address: p.address,
  website: p.website,
});

export default function ProfileForm({
  profile,
  canEdit,
  saving,
  onSubmit,
}: {
  profile: ResponseInterface;
  canEdit: boolean;
  saving: boolean;
  onSubmit: (body: UpdateInterface) => void;
}) {
  const [form, setForm] = useState<UpdateInterface>(() => pick(profile));
  const original = pick(profile);
  const dirty = (Object.keys(form) as Array<keyof UpdateInterface>).some((key) => form[key] !== original[key]);

  const set = <K extends keyof UpdateInterface>(key: K, value: UpdateInterface[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <div>
            <CardTitle>Identitas organisasi</CardTitle>
            <p className="text-xs text-muted mt-0.5">Dipakai di seluruh aplikasi dan dalam konteks kerja role AI.</p>
          </div>
          {!canEdit && (
            <span className="text-[11px] font-semibold text-muted bg-canvas rounded-full px-3 py-1">Hanya baca</span>
          )}
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canEdit || saving} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Nama organisasi" required value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={150} />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Deskripsi"
                rows={3}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                helperText="Ringkas tugas pokok organisasi. Role AI membaca ini sebagai latar belakang kerja."
                maxLength={1000}
              />
            </div>
            <Select
              label="Sektor"
              value={form.sector}
              onChange={(e) => set("sector", e.target.value as UpdateInterface["sector"])}
              options={SECTOR_OPTIONS}
            />
            <Select label="Zona waktu" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} options={TIMEZONE_OPTIONS} />
            <Input label="Email kontak" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <Input label="Telepon" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            <Input label="Situs web" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
            <Input label="Alamat" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </fieldset>

          {canEdit && (
            <div className="flex items-center justify-end gap-3 pt-6">
              {dirty && <span className="text-xs text-amber-700 rise">Ada perubahan belum disimpan</span>}
              <Button variant="ghost" disabled={!dirty || saving} onClick={() => setForm(original)}>
                Batalkan
              </Button>
              <Button type="submit" loading={saving} disabled={!dirty} icon={<Icon name="check" size={16} />}>
                Simpan perubahan
              </Button>
            </div>
          )}
        </CardContent>
      </form>
    </Card>
  );
}
