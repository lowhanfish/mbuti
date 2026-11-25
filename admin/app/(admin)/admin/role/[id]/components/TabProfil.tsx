"use client";

import React, { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Textarea } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { AvatarEditor } from "../../../../_components/agent/avatar-editor";
import { useResponseOptionLead, useResponseOptionUnit } from "../../../organisasi/unit/hooks/crud";
import { STATUS_LABEL, type AgentStatus, type ResponseInterface, type UpdateInterface } from "../../types";

type ProfilFields = Pick<UpdateInterface, "name" | "title" | "unit_id" | "goal" | "status" | "owner_member_id" | "avatar">;

const pick = (r: ResponseInterface): ProfilFields => ({
  name: r.name,
  title: r.title,
  unit_id: r.unit_id,
  goal: r.goal,
  status: r.status,
  owner_member_id: r.owner_member_id,
  avatar: r.avatar,
});

export default function TabProfil({
  role,
  canEdit,
  saving,
  onSave,
}: {
  role: ResponseInterface;
  canEdit: boolean;
  saving: boolean;
  onSave: (body: Partial<UpdateInterface>) => void;
}) {
  const [form, setForm] = useState<ProfilFields>(() => pick(role));
  const { List: units } = useResponseOptionUnit();
  const { List: members } = useResponseOptionLead();
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(role));
  const set = <K extends keyof ProfilFields>(key: K, value: ProfilFields[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Identitas role</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canEdit || saving} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <Input label="Nama panggilan" required value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} />
              <Input label="Jabatan" required value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={100} />
            </div>
            <Textarea
              label="Tujuan kerja"
              rows={3}
              value={form.goal}
              onChange={(e) => set("goal", e.target.value)}
              helperText="Satu-dua kalimat tentang hasil yang harus dicapai. Wajib diisi sebelum role diaktifkan."
              maxLength={500}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Unit" value={form.unit_id ?? ""} onChange={(e) => set("unit_id", e.target.value || null)}>
                <option value="">— Belum ditempatkan —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.value}
                  </option>
                ))}
              </Select>
              <Select
                label="Penanggung jawab"
                value={form.owner_member_id ?? ""}
                onChange={(e) => set("owner_member_id", e.target.value || null)}
                helperText="Manusia yang mengawasi role ini."
              >
                <option value="">— Belum ditentukan —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.value}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted">Status</span>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(STATUS_LABEL) as AgentStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={form.status === s}
                    onClick={() => set("status", s)}
                    className={`h-10 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      form.status === s
                        ? s === "active"
                          ? "bg-emerald-500 text-white shadow-md"
                          : s === "paused"
                            ? "bg-amber-400 text-ink shadow-md"
                            : "bg-ink text-white shadow-md"
                        : "bg-white border border-line text-muted hover:text-ink"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted">Hanya role aktif yang bisa menerima tugas. Draf dan dijeda tetap bisa diuji coba.</p>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tampilan karakter</CardTitle>
          <span className="text-[11px] text-faint">Tampil di kantor 3D</span>
        </CardHeader>
        <CardContent>
          <AvatarEditor value={form.avatar} onChange={(avatar) => set("avatar", avatar)} disabled={!canEdit || saving} />
        </CardContent>
      </Card>

      {canEdit && (
        <div className="xl:col-span-2 sticky bottom-4 z-20 flex items-center justify-end gap-3 glass rounded-2xl px-4 py-3">
          {dirty && <span className="text-xs text-amber-700 mr-auto rise">Ada perubahan belum disimpan</span>}
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setForm(pick(role))}>
            Batalkan
          </Button>
          <Button loading={saving} disabled={!dirty} icon={<Icon name="check" size={16} />} onClick={() => onSave(form)}>
            Simpan profil
          </Button>
        </div>
      )}
    </div>
  );
}
