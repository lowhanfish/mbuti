"use client";

import Link from "next/link";
import React from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { RunStatusBadge } from "../../../alur/components/FlowParts";
import type { NamedValue } from "../../../alur/types";
import type { TaskFlow, TaskStatus } from "../../types";

const STAGE_LABEL = {
  waiting: "Menunggu pekerjaan selesai",
  prepare: "Menyusun isian",
  running: "Membuka aplikasi",
  done: "Selesai",
} as const;

function Values({ title, values }: { title: string; values: NamedValue[] }) {
  if (!values.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-faint">{title}</p>
      {values.map((v) => (
        <div key={v.label}>
          <p className="text-[11px] text-muted">{v.label}</p>
          <p className="text-sm text-ink whitespace-pre-line break-words">{v.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function TaskFlowCard({ flow, status }: { flow: TaskFlow; status: TaskStatus }) {
  const stopped = !["queued", "running", "waiting_approval", "completed"].includes(status);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alur aplikasi</CardTitle>
        {flow.run_status ? <RunStatusBadge status={flow.run_status} /> : <Badge size="sm">{stopped ? "Tidak dijalankan" : STAGE_LABEL[flow.stage]}</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-semibold text-ink break-words">{flow.name}</p>
        {flow.run_message && <p className="text-xs text-muted">{flow.run_message}</p>}
        <Values title="Isian" values={flow.values} />
        <Values title="Dari aplikasi" values={flow.outputs} />
        {flow.run_id && (
          <Link href={`/admin/alur/jalan/${flow.run_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
            {flow.run_status === "waiting_otp" ? "Masukkan kode OTP" : "Lihat putaran dan bukti"}
            <Icon name="arrow" size={13} />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
