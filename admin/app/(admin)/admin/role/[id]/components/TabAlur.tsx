"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, Skeleton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import FlowFormModal from "../../../alur/components/FlowFormModal";
import { RunStatusBadge, formatDateTime } from "../../../alur/components/FlowParts";
import { useLearnFlow, useResponseListFlow } from "../../../alur/hooks/crud";
import { FLOW_STATUS } from "../../../alur/types";
import type { ResponseInterface } from "../../types";

export default function TabAlur({ role }: { role: ResponseInterface }) {
  const router = useRouter();
  const { Flows, isLoading, isError, error } = useResponseListFlow(role.id);
  const learn = useLearnFlow(role.id);
  const [open, setOpen] = useState(false);
  const flows = Flows?.flows ?? [];
  const canTeach = Boolean(Flows?.can_manage);
  const hasAccount = Boolean(Flows?.accounts.some((a) => !a.locked));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Alur aplikasi {role.name}</CardTitle>
          <p className="text-xs text-muted mt-0.5">Dipelajari sekali, lalu diulang program. Kirim dan simpan menunggu persetujuan.</p>
        </div>
        {canTeach && hasAccount && (
          <Button size="sm" icon={<Icon name="plus" size={14} />} onClick={() => setOpen(true)}>
            Ajari alur baru
          </Button>
        )}
      </CardHeader>

      {isError ? (
        <p role="alert" className="p-6 text-sm text-red-600">{error instanceof Error ? error.message : "Alur tidak dapat dimuat."}</p>
      ) : isLoading || !Flows ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : flows.length === 0 ? (
        <EmptyState
          icon={<Icon name="flow" size={26} />}
          title="Belum ada alur"
          description={
            hasAccount
              ? `Ajari ${role.name} satu pekerjaan di aplikasi web, mis. "isi laporan harian".`
              : "Simpan dulu akun aplikasinya di tab Brankas."
          }
        />
      ) : (
        <ul className="divide-y divide-line/70">
          {flows.map((flow) => (
            <li key={flow.id}>
              <Link href={`/admin/alur/${flow.id}`} className="flex flex-wrap items-center gap-2 px-6 py-4 hover:bg-surface/60">
                <span className="text-sm font-bold text-ink">{flow.name}</span>
                <Badge variant={FLOW_STATUS[flow.status].variant} size="sm">{FLOW_STATUS[flow.status].label}</Badge>
                {flow.trusted_submit && <Badge variant="accent" size="sm">Kirim tanpa persetujuan</Badge>}
                <span className="basis-full text-[11px] text-faint">
                  {flow.account_name || "Akun sudah dihapus"} · {flow.steps_count} langkah · versi {flow.version} · {flow.successful_runs} putaran berhasil
                </span>
                {flow.last_run && (
                  <span className="basis-full flex items-center gap-2 text-[11px] text-muted">
                    Terakhir {formatDateTime(flow.last_run.created_at)} <RunStatusBadge status={flow.last_run.status} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {open && Flows && (
        <FlowFormModal
          roleName={role.name}
          accounts={Flows.accounts}
          saving={learn.isPending}
          onClose={() => setOpen(false)}
          onSubmit={(body) =>
            learn.mutate(body, {
              onSuccess: (res) => {
                setOpen(false);
                router.push(`/admin/alur/${res.data.id}`);
              },
            })
          }
        />
      )}
    </Card>
  );
}
