"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "../../../../_components/ui";
import { buttonClasses } from "../../../../_components/ui/button-classes";
import { Icon } from "../../../../_components/admin-icons";
import { REVISION_SOURCE_LABEL, REVISION_STATUS_LABEL, isOpenRevision } from "../../formation-types";
import { useFormation, useStartRevision, useToolRequests } from "../../hooks/formation";
import type { ResponseInterface } from "../../types";
import { SkillView } from "../bentuk/components/StepKartu";

export default function TabPembentukan({ role }: { role: ResponseInterface }) {
  const router = useRouter();
  const { Formation: formation, isLoading } = useFormation(role.id);
  const { Requests } = useToolRequests();
  const start = useStartRevision(role.id);

  if (isLoading || !formation) return <Skeleton className="h-72 rounded-3xl" />;

  const open = isOpenRevision(formation.status);
  const requests = Requests.filter((r) => r.agent_id === role.id);
  const href = `/admin/role/${role.id}/bentuk`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Keterampilan {role.name}</CardTitle>
          <Badge size="sm" variant={open ? "info" : "success"} dot>
            Versi {formation.version_no} · {REVISION_STATUS_LABEL[formation.status]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {formation.card ? (
            <>
              <p className="text-sm text-muted leading-relaxed">{formation.card.summary}</p>
              {formation.card.skills.map((s) => (
                <SkillView key={s.key} skill={s} />
              ))}
            </>
          ) : (
            <p className="text-sm text-muted">
              {formation.source === "manual"
                ? "Versi ini diisi manual, tanpa kartu keterampilan. Mulai pembentukan agar AI menyusun keterampilan dari uraian jabatan dan tanya jawab."
                : "Kartu keterampilan muncul setelah bahan dianalisis."}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card glow>
          <CardContent className="space-y-3">
            {open ? (
              <>
                <p className="text-sm font-bold text-ink">Revisi versi {formation.version_no} sedang disusun</p>
                <p className="text-xs text-muted leading-relaxed">
                  {role.active_version_no > 0
                    ? `${role.name} tetap bekerja dengan versi ${role.active_version_no} sampai revisi ini Final.`
                    : `${role.name} belum menerima tugas sampai versi pertama Final.`}
                  {formation.open_required > 0 ? ` Masih ada ${formation.open_required} pertanyaan wajib.` : ""}
                </p>
                <Link href={href} className={`${buttonClasses("primary", "md")} w-full`}>
                  <Icon name="arrow" size={15} />
                  Lanjutkan pembentukan
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-ink">Versi {formation.version_no} Final</p>
                <p className="text-xs text-muted leading-relaxed">
                  Sumber: {REVISION_SOURCE_LABEL[formation.source]}. Mengubah keterampilan membuka revisi baru dengan analisis dan tanya jawab, lalu perlu Final lagi.
                </p>
                {formation.can_edit && (
                  <Button
                    className="w-full"
                    icon={<Icon name="edit" size={15} />}
                    loading={start.isPending}
                    onClick={() => start.mutate({}, { onSuccess: () => router.push(href) })}
                  >
                    Ubah lewat pembentukan
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
        {requests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Permintaan alat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink">
                    <strong>{r.requested}</strong> <span className="text-faint">untuk {r.skill_name}</span>
                  </span>
                  <Badge size="sm" variant="neutral">
                    {r.status === "open" ? "Dicatat" : r.status === "planned" ? "Direncanakan" : r.status === "done" ? "Tersedia" : "Ditolak"}
                  </Badge>
                </div>
              ))}
              <p className="text-[11px] text-faint pt-1">Alat yang belum didukung dicatat untuk pengelola MBUTI.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
