"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { isMockMode } from "@/lib/transport";
import { ACCESS_ROLE_LABEL, formatDate } from "@/utilities/labels";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, PageHeader, Skeleton } from "../../_components/ui";
import { Icon } from "../../_components/admin-icons";
import { DisableModal, EnableModal, RecoveryModal } from "./components/TwoFactorModals";
import { useResponseTwoFactor } from "./hooks/crud";

export default function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const { Status, isLoading, isError, error } = useResponseTwoFactor();
  const [dialog, setDialog] = useState<"enable" | "recovery" | "disable" | null>(null);
  const close = () => setDialog(null);

  const facts = [
    { label: "Nama", value: user?.full_name },
    { label: "Email", value: user?.email },
    { label: "Hak akses", value: user?.access_role ? ACCESS_ROLE_LABEL[user.access_role] : "Tanpa akses" },
    { label: "Organisasi", value: user?.organization?.name },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Akun Saya" description="Data diri dan keamanan masuk." />

      <div className="grid gap-4 xl:grid-cols-[360px_1fr] items-start">
        <Card>
          <CardHeader>
            <CardTitle>Data diri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {facts.map((f) => (
              <div key={f.label} className="space-y-0.5">
                <p className="text-[11px] font-semibold text-muted">{f.label}</p>
                <p className="text-sm text-ink break-words">{f.value ?? "-"}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Verifikasi dua langkah</CardTitle>
              <p className="text-xs text-muted mt-0.5">Masuk memakai kata sandi dan kode dari ponsel Anda.</p>
            </div>
            {Status && <Badge variant={Status.enabled ? "success" : "warning"} dot>{Status.enabled ? "Aktif" : "Belum aktif"}</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            {isError ? (
              <p role="alert" className="text-sm text-red-600">{error instanceof Error ? error.message : "Status tidak dapat dimuat."}</p>
            ) : isLoading || !Status ? (
              <Skeleton className="h-24" />
            ) : Status.enabled ? (
              <>
                <p className="text-sm text-muted leading-relaxed">
                  Aktif sejak {Status.enabled_at ? formatDate(Status.enabled_at) : "-"}. Sisa kode cadangan:{" "}
                  <strong className="text-ink">{Status.recovery_codes_left}</strong>.
                </p>
                {Status.recovery_codes_left <= 2 && (
                  <p className="rounded-2xl bg-amber-400/20 p-3 text-sm text-amber-800">Kode cadangan hampir habis. Buat yang baru.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDialog("recovery")}>
                    Buat ulang kode cadangan
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog("disable")}>
                    Matikan
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted leading-relaxed">
                  Diperlukan untuk menyimpan atau mengubah akun di <strong className="text-ink">brankas role</strong>, dan
                  melindungi akun Anda bila kata sandi bocor.
                </p>
                <Button size="sm" icon={<Icon name="shield" size={14} />} onClick={() => setDialog("enable")}>
                  Aktifkan
                </Button>
              </>
            )}
            {isMockMode() && (
              <p className="text-[11px] text-faint">Mode data contoh: kode authenticator selalu 123456.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {dialog === "enable" && <EnableModal onClose={close} />}
      {dialog === "recovery" && <RecoveryModal onClose={close} />}
      {dialog === "disable" && <DisableModal vaultAccounts={Status?.vault_accounts ?? 0} onClose={close} />}
    </div>
  );
}
