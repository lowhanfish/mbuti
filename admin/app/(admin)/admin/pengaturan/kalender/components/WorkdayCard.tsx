"use client";

import React, { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "../../../../_components/ui";
import { WEEKDAY_LABEL } from "../../../tugas/rutin/types";
import { useSaveWorkdays } from "../hooks/crud";

export function DayToggles({ value, disabled, onChange }: { value: number[]; disabled?: boolean; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hari">
      {WEEKDAY_LABEL.slice(1).map((label, i) => {
        const day = i + 1;
        const on = value.includes(day);
        return (
          <button
            key={label}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((d) => d !== day) : [...value, day].sort())}
            className={`h-9 px-3 rounded-xl text-xs font-semibold transition-all enabled:cursor-pointer ${on ? "bg-brand text-white" : "bg-surface border border-line text-muted"}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function WorkdayCard({ workdays, timezone, canEdit }: { workdays: number[]; timezone: string; canEdit: boolean }) {
  const [draft, setDraft] = useState<number[] | null>(null);
  const save = useSaveWorkdays();
  const value = draft ?? workdays;
  const dirty = value.join() !== workdays.join();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hari kerja</CardTitle>
        <span className="text-xs text-muted">Zona waktu {timezone}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted">Hari yang tidak dipilih dianggap libur mingguan. Zona waktu diubah di Profil organisasi.</p>
        <DayToggles value={value} disabled={!canEdit} onChange={setDraft} />
        {canEdit && (
          <Button size="sm" disabled={!dirty || value.length === 0} loading={save.isPending} onClick={() => save.mutate(value, { onSuccess: () => setDraft(null) })}>
            Simpan hari kerja
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
