"use client";

import React, { useState } from "react";
import { formatDate } from "@/utilities/labels";
import { Button, IconButton, Input, Modal } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { useLeaveMutations, useResponseLeaves } from "../hooks/leave";
import type { ResponseInterface } from "../types";

export default function LeaveModal({ member, onClose }: { member: ResponseInterface; onClose: () => void }) {
  const { Leaves, isLoading } = useResponseLeaves(member.id);
  const { add, remove } = useLeaveMutations(member.id);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const invalid = Boolean(start && end && end < start);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Cuti ${member.full_name}`}
      description="Selama cuti, tugas rutin untuk role yang ia tanggung jawabi mengikuti pilihan di jadwalnya."
      maxWidth="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate({ start_date: start, end_date: end || start, note: note.trim() }, { onSuccess: () => { setStart(""); setEnd(""); setNote(""); } });
        }}
      >
        <Input label="Mulai" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
        <Input label="Sampai" type="date" min={start} value={end} error={invalid ? "Tidak boleh sebelum tanggal mulai." : undefined} onChange={(e) => setEnd(e.target.value)} helperText="Kosong = satu hari" />
        <Input label="Catatan" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" />
        <Button type="submit" disabled={!start || invalid} loading={add.isPending}>
          Tambah cuti
        </Button>
      </form>

      <ul className="space-y-2">
        {!isLoading && Leaves.length === 0 && <li className="text-xs text-faint">Belum ada cuti tercatat.</li>}
        {Leaves.map((l) => (
          <li key={l.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/70 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">
                {formatDate(l.start_date)}
                {l.end_date !== l.start_date && ` – ${formatDate(l.end_date)}`}
              </p>
              {l.note && <p className="text-[11px] text-muted truncate">{l.note}</p>}
            </div>
            <IconButton label="Hapus cuti" tone="danger" onClick={() => remove.mutate(l.id)}>
              <Icon name="trash" size={16} />
            </IconButton>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
