"use client";

import React, { useRef, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, IconButton, Input, Select, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { formatDay, todayIso } from "../../../tugas/rutin/types";
import { useDeleteDay, useImportDays, useResponseCalendarDays, useSaveDay } from "../hooks/crud";
import { DAY_KIND_LABEL, type CalendarDayRequest, type DayKind } from "../types";

const EMPTY: CalendarDayRequest = { date: "", kind: "holiday", name: "", label: "" };

export default function DaysCard({ canEdit }: { canEdit: boolean }) {
  const thisYear = Number(todayIso().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [form, setForm] = useState<CalendarDayRequest>(EMPTY);
  const { Days, isLoading } = useResponseCalendarDays(year);
  const save = useSaveDay();
  const remove = useDeleteDay();
  const importer = useImportDays();
  const fileRef = useRef<HTMLInputElement>(null);
  const labels = [...new Set(Days.map((d) => d.label).filter(Boolean))];

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Libur dan hari khusus</CardTitle>
        <div className="flex items-center gap-2">
          <div className="w-28">
            <Select aria-label="Tahun" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importer.mutate(file);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="outline" loading={importer.isPending} onClick={() => fileRef.current?.click()}>
                Impor CSV
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted">
          Isi sesuai kalender negara dan organisasi Anda. Format CSV: <code className="font-mono">tanggal,nama,jenis</code>, tanggal YYYY-MM-DD, jenis bebas (mis. Libur nasional); tulis
          “Hari kerja” untuk hari kerja pengganti.
        </p>
        {canEdit && (
          <form
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[160px_200px_1fr_1fr_auto] items-end"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ ...form, name: form.name.trim(), label: form.label.trim() }, { onSuccess: () => { setYear(Number(form.date.slice(0, 4))); setForm(EMPTY); } });
            }}
          >
            <Input label="Tanggal" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Select label="Pengaruh" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as DayKind })} options={Object.entries(DAY_KIND_LABEL).map(([value, label]) => ({ value, label }))} />
            <Input label="Nama" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Tahun Baru" />
            <Input label="Jenis (bebas)" maxLength={60} list="jenis-hari" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="mis. Libur nasional" />
            <datalist id="jenis-hari">
              {labels.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <Button type="submit" loading={save.isPending} disabled={!form.date || form.name.trim().length < 2}>
              Tambah
            </Button>
          </form>
        )}
      </CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Pengaruh</TableHead>
            <TableHead>
              <span className="sr-only">Aksi</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isLoading && Days.length === 0 && <TableEmpty colSpan={4} message={`Belum ada tanggal khusus untuk ${year}.`} />}
          {Days.map((d) => (
            <TableRow key={d.id}>
              <TableCell>{formatDay(d.date)}</TableCell>
              <TableCell>
                <span className="font-semibold text-ink">{d.name}</span>
                {d.label && <span className="block text-[11px] text-faint">{d.label}</span>}
              </TableCell>
              <TableCell>
                <Badge size="sm" variant={d.kind === "holiday" ? "danger" : "success"}>
                  {DAY_KIND_LABEL[d.kind]}
                </Badge>
              </TableCell>
              <TableCell>
                {canEdit && (
                  <IconButton
                    label={`Hapus ${d.name}`}
                    tone="danger"
                    onClick={async () => {
                      if (await confirmAlert(`Hapus ${d.name}?`, formatDay(d.date), "Ya, hapus")) remove.mutate(d.id);
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
