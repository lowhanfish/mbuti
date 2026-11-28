"use client";

import Link from "next/link";
import React, { useState } from "react";
import { formatDate } from "@/utilities/labels";
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, Skeleton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { VaultActionModal, VaultCodeModal, VaultFormModal } from "../../components/VaultModals";
import { useResponseVault } from "../../hooks/vault";
import type { ResponseInterface } from "../../types";
import { VAULT_BLOCKER_TEXT, VAULT_MAX_ACCOUNTS, type VaultAccount } from "../../vault-types";

type Dialog =
  | { kind: "form"; account: VaultAccount | null }
  | { kind: "delete" | "confirm" | "code"; account: VaultAccount }
  | null;

export default function TabBrankas({ role }: { role: ResponseInterface }) {
  const { Vault, isLoading, isError, error } = useResponseVault(role.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const accounts = Vault?.accounts ?? [];
  const canManage = Boolean(Vault?.access.can_manage);
  const blocker = Vault?.access.blocker;

  return (
    <div className="space-y-4">
      {blocker && (
        <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-3 text-sm text-muted">
          <Icon name="lock" size={18} className="text-brand shrink-0" />
          <span className="flex-1 min-w-48">
            {VAULT_BLOCKER_TEXT[blocker]}
            {blocker === "not_responsible" && Vault?.access.responsible_name ? ` Penanggung jawab: ${Vault.access.responsible_name}.` : ""}
          </span>
          {blocker === "two_factor_off" && (
            <Link href="/admin/akun" className="text-sm font-semibold text-brand hover:underline">
              Buka Akun Saya
            </Link>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Akun aplikasi untuk {role.name}</CardTitle>
            <p className="text-xs text-muted mt-0.5">
              Dipakai program untuk masuk ke aplikasi luar. Password tidak pernah ditampilkan dan tidak dikirim ke model AI.
            </p>
          </div>
          {canManage && accounts.length < VAULT_MAX_ACCOUNTS && (
            <Button size="sm" icon={<Icon name="plus" size={14} />} onClick={() => setDialog({ kind: "form", account: null })}>
              Tambah akun
            </Button>
          )}
        </CardHeader>

        {isError ? (
          <p role="alert" className="p-6 text-sm text-red-600">{error instanceof Error ? error.message : "Brankas tidak dapat dimuat."}</p>
        ) : isLoading || !Vault ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState icon={<Icon name="lock" size={26} />} title="Brankas masih kosong" description={`Simpan akun aplikasi web yang akan dibuka ${role.name}.`} />
        ) : (
          <ul className="divide-y divide-line/70">
            {accounts.map((a) => (
              <li key={a.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-ink">{a.name}</p>
                    {a.locked && <Badge variant="warning" size="sm">Perlu dikonfirmasi</Badge>}
                    {a.has_totp && <Badge variant="info" size="sm">Authenticator</Badge>}
                    {a.login_failed && <Badge variant="danger" size="sm">Gagal masuk</Badge>}
                  </div>
                  <p className="text-xs text-muted break-all">{a.url}</p>
                  {a.other_urls.length > 0 && <p className="text-[11px] text-faint break-all">Juga: {a.other_urls.join(", ")}</p>}
                  <p className="text-[11px] text-faint">
                    {a.username ? <>Username <strong className="text-muted">{a.username}</strong> · </> : null}
                    Password diganti {formatDate(a.password_changed_at)}
                  </p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {a.locked || a.login_failed ? (
                      <Button size="sm" onClick={() => setDialog({ kind: "confirm", account: a })}>Konfirmasi</Button>
                    ) : (
                      <>
                        {a.has_totp && (
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "code", account: a })}>Lihat kode</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "form", account: a })}>Ubah</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" icon={<Icon name="trash" size={14} />} onClick={() => setDialog({ kind: "delete", account: a })}>
                      Hapus
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dialog?.kind === "form" && <VaultFormModal roleId={role.id} account={dialog.account} onClose={close} />}
      {(dialog?.kind === "delete" || dialog?.kind === "confirm") && (
        <VaultActionModal roleId={role.id} account={dialog.account} action={dialog.kind} onClose={close} />
      )}
      {dialog?.kind === "code" && <VaultCodeModal roleId={role.id} account={dialog.account} onClose={close} />}
    </div>
  );
}
