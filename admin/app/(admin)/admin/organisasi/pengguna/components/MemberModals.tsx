"use client";

import React, { useState } from "react";
import type { AccessRole } from "@/types/global";
import { ACCESS_ROLE_DESCRIPTION, ACCESS_ROLE_LABEL } from "@/utilities/labels";
import { Button, Input, Modal, Select } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { useResponseOptionUnit } from "../../unit/hooks/crud";
import type { InviteInterface, ResponseInterface, UpdateInterface } from "../types";
import { MemberAvatar } from "./MemberParts";

/** Pilihan hak akses berbentuk kartu, dengan penjelasan singkat. */
function AccessRolePicker({
  value,
  onChange,
  allowOwner,
}: {
  value: AccessRole;
  onChange: (role: AccessRole) => void;
  allowOwner: boolean;
}) {
  const roles: AccessRole[] = allowOwner ? ["owner", "admin", "member", "viewer"] : ["admin", "member", "viewer"];
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-muted mb-2">Hak akses</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => (
          <label
            key={role}
            className={`flex gap-3 rounded-2xl border p-3 cursor-pointer transition-all ${
              value === role ? "border-brand bg-brand-soft/60 shadow-[0_0_0_3px_rgba(124,77,255,.12)]" : "border-line bg-white hover:border-brand/40"
            }`}
          >
            <input
              type="radio"
              name="access_role"
              value={role}
              checked={value === role}
              onChange={() => onChange(role)}
              className="mt-0.5 accent-[var(--color-brand)]"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-semibold text-ink">{ACCESS_ROLE_LABEL[role]}</span>
              <span className="block text-[11px] text-muted leading-snug">{ACCESS_ROLE_DESCRIPTION[role]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function UnitSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { List } = useResponseOptionUnit();
  return (
    <Select label="Unit" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— Tanpa unit —</option>
      {List.map((u) => (
        <option key={u.id} value={u.id}>
          {u.value}
        </option>
      ))}
    </Select>
  );
}

export function InviteMemberModal({
  isOpen,
  allowOwner,
  saving,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  allowOwner: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (body: InviteInterface) => void;
}) {
  const [form, setForm] = useState<InviteInterface>({ full_name: "", email: "", access_role: "member", unit_id: null });
  const [touched, setTouched] = useState(false);
  const nameError = touched && form.full_name.trim().length < 2 ? "Nama minimal 2 karakter." : undefined;
  const emailError = touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? "Format email tidak valid." : undefined;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (form.full_name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return;
    onSubmit({ ...form, full_name: form.full_name.trim(), email: form.email.trim().toLowerCase() });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Undang anggota"
      description="Anggota tercatat sebagai Diundang. Pengiriman email undangan belum tersedia, jadi ia belum bisa masuk."
      maxWidth="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" form="invite-form" loading={saving} icon={<Icon name="mail" size={16} />}>
            Kirim undangan
          </Button>
        </>
      }
    >
      <form id="invite-form" className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nama lengkap"
            required
            autoFocus
            value={form.full_name}
            error={nameError}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            required
            value={form.email}
            error={emailError}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="nama@instansi.go.id"
          />
        </div>
        <UnitSelect value={form.unit_id} onChange={(unit_id) => setForm({ ...form, unit_id })} />
        <AccessRolePicker value={form.access_role} allowOwner={allowOwner} onChange={(access_role) => setForm({ ...form, access_role })} />
      </form>
    </Modal>
  );
}

export function EditMemberModal({
  member,
  allowOwner,
  saving,
  onClose,
  onSubmit,
}: {
  member: ResponseInterface;
  allowOwner: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (body: UpdateInterface) => void;
}) {
  const [form, setForm] = useState<UpdateInterface>({
    access_role: member.access_role,
    unit_id: member.unit_id,
    status: member.status === "disabled" ? "disabled" : "active",
  });
  const ownerLocked = member.access_role === "owner" && !allowOwner;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Ubah anggota"
      maxWidth="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button loading={saving} disabled={ownerLocked} onClick={() => onSubmit(form)}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
        <MemberAvatar name={member.full_name} size={44} />
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{member.full_name}</p>
          <p className="text-xs text-muted truncate">{member.email}</p>
        </div>
      </div>

      {ownerLocked ? (
        <p className="text-sm text-amber-800 bg-accent-soft rounded-xl px-3 py-2">Hanya pemilik yang dapat mengubah akun pemilik.</p>
      ) : (
        <>
          <UnitSelect value={form.unit_id} onChange={(unit_id) => setForm({ ...form, unit_id })} />
          <AccessRolePicker value={form.access_role} allowOwner={allowOwner} onChange={(access_role) => setForm({ ...form, access_role })} />
          {member.status !== "invited" && !member.is_self && (
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3 cursor-pointer">
              <span>
                <span className="block text-sm font-semibold text-ink">Akun aktif</span>
                <span className="block text-[11px] text-muted">Akun nonaktif tidak bisa masuk, tetapi riwayatnya tetap tersimpan.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={form.status === "active"}
                onChange={(e) => setForm({ ...form, status: e.target.checked ? "active" : "disabled" })}
                className="w-10 h-6 appearance-none rounded-full bg-line checked:bg-brand relative cursor-pointer transition-colors before:content-[''] before:absolute before:top-1 before:left-1 before:w-4 before:h-4 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-4"
              />
            </label>
          )}
        </>
      )}
    </Modal>
  );
}
