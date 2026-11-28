"use client";

import React, { useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { Button, Card, CardContent, CardHeader, CardTitle, IconButton, Input, Modal } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { WEEKDAY_LABEL } from "../../../tugas/rutin/types";
import { useDeleteShift, useSaveShift } from "../hooks/crud";
import type { ShiftRequest, WorkShift } from "../types";
import { DayToggles } from "./WorkdayCard";

function ShiftModal({ shift, workdays, onClose }: { shift?: WorkShift; workdays: number[]; onClose: () => void }) {
  const [form, setForm] = useState<ShiftRequest>(
    shift ? { name: shift.name, start_time: shift.start_time, end_time: shift.end_time, weekdays: shift.weekdays } : { name: "", start_time: "08:00", end_time: "16:00", weekdays: workdays }
  );
  const save = useSaveShift();
  const valid = form.name.trim().length >= 2 && form.start_time && form.end_time && form.start_time !== form.end_time && form.weekdays.length > 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={shift ? "Ubah shift" : "Tambah shift"}
      description="Jam selesai yang lebih kecil dari jam mulai berarti melewati tengah malam."
      maxWidth="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate({ id: shift?.id, body: { ...form, name: form.name.trim() } }, { onSuccess: onClose })}>
            Simpan
          </Button>
        </>
      }
    >
      <Input label="Nama shift" required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Pagi, Malam, Piket" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Jam mulai" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        <Input label="Jam selesai" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-muted">Berlaku pada hari</span>
        <DayToggles value={form.weekdays} onChange={(weekdays) => setForm({ ...form, weekdays })} />
      </div>
    </Modal>
  );
}

export default function ShiftCard({ shifts, workdays, canEdit }: { shifts: WorkShift[]; workdays: number[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<WorkShift | "new" | null>(null);
  const remove = useDeleteShift();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift</CardTitle>
        {canEdit && (
          <Button size="sm" variant="outline" icon={<Icon name="plus" size={14} />} onClick={() => setEditing("new")}>
            Tambah shift
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {shifts.length === 0 && <p className="text-xs text-muted">Belum ada shift. Tanpa shift, jadwal memakai jam tetap dan hari kerja di atas.</p>}
        {shifts.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/70 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">
                {s.name} <span className="font-semibold text-brand">{s.start_time}–{s.end_time}</span>
                {s.end_time < s.start_time && <span className="text-[11px] text-faint"> (hari berikutnya)</span>}
              </p>
              <p className="text-[11px] text-muted">{s.weekdays.map((d) => WEEKDAY_LABEL[d]).join(", ")}</p>
            </div>
            {canEdit && (
              <>
                <IconButton label={`Ubah shift ${s.name}`} onClick={() => setEditing(s)}>
                  <Icon name="edit" size={16} />
                </IconButton>
                <IconButton
                  label={`Hapus shift ${s.name}`}
                  tone="danger"
                  onClick={async () => {
                    if (await confirmAlert(`Hapus shift ${s.name}?`, "Shift yang dipakai tugas rutin tidak bisa dihapus.", "Ya, hapus")) remove.mutate(s.id);
                  }}
                >
                  <Icon name="trash" size={16} />
                </IconButton>
              </>
            )}
          </div>
        ))}
      </CardContent>
      {editing && <ShiftModal shift={editing === "new" ? undefined : editing} workdays={workdays} onClose={() => setEditing(null)} />}
    </Card>
  );
}
