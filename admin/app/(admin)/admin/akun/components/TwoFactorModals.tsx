"use client";

import Image from "next/image";
import React, { useState } from "react";
import { Button, CodeInput, Input, Modal, codeReady } from "../../../_components/ui";
import { useDisableTwoFactor, useEnableTwoFactor, useNewRecoveryCodes, useStartTwoFactor } from "../hooks/crud";
import type { TwoFactorSetup } from "../types";
import RecoveryCodeList from "./RecoveryCodeList";

const ErrorText = ({ error }: { error: unknown }) =>
  error instanceof Error ? (
    <p role="alert" className="text-sm font-medium text-red-600">
      {error.message}
    </p>
  ) : null;

/** Kata sandi → pindai kunci → masukkan kode → simpan kode cadangan. */
export function EnableModal({ onClose }: { onClose: () => void }) {
  const start = useStartTwoFactor();
  const enable = useEnableTwoFactor();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!setup) start.mutate(password, { onSuccess: (res) => setSetup(res.data) });
    else enable.mutate(code, { onSuccess: (res) => setCodes(res.data.recovery_codes) });
  };

  if (codes) {
    return (
      // Ditutup hanya lewat tombol, agar kode cadangan tidak hilang tanpa sengaja
      <Modal isOpen onClose={() => undefined} title="Verifikasi dua langkah aktif" footer={<Button onClick={onClose}>Sudah saya simpan</Button>}>
        <RecoveryCodeList codes={codes} />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Aktifkan verifikasi dua langkah"
      description={setup ? "Langkah 2 dari 2: hubungkan aplikasi authenticator." : "Langkah 1 dari 2: pastikan ini Anda."}
    >
      <form className="space-y-4" onSubmit={submit}>
        {!setup ? (
          <Input
            label="Kata sandi"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        ) : (
          <>
            <p className="text-sm text-muted leading-relaxed">
              Buka Google Authenticator, Microsoft Authenticator, Aegis, atau aplikasi sejenis, lalu {setup.qr_svg ? "pindai gambar ini" : "tambahkan kunci ini"}.
            </p>
            {setup.qr_svg && (
              <div className="flex justify-center">
                <Image src={setup.qr_svg} alt="Kode QR untuk aplikasi authenticator" width={200} height={200} unoptimized className="rounded-2xl bg-white p-2" />
              </div>
            )}
            <div className="rounded-2xl border border-line bg-canvas p-3 space-y-1">
              <p className="text-[11px] font-semibold text-muted">Kunci untuk diketik manual</p>
              <p className="font-mono text-sm text-ink break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
            </div>
            <CodeInput label="Kode 6 angka dari aplikasi" value={code} onValueChange={setCode} autoFocus />
          </>
        )}
        <ErrorText error={setup ? enable.error : start.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="submit"
            loading={start.isPending || enable.isPending}
            disabled={setup ? !codeReady(code) : !password}
          >
            {setup ? "Aktifkan" : "Lanjutkan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RecoveryModal({ onClose }: { onClose: () => void }) {
  const create = useNewRecoveryCodes();
  const [code, setCode] = useState("");
  const codes = create.data?.data.recovery_codes;

  if (codes) {
    return (
      <Modal isOpen onClose={() => undefined} title="Kode cadangan baru" footer={<Button onClick={onClose}>Sudah saya simpan</Button>}>
        <RecoveryCodeList codes={codes} />
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Buat ulang kode cadangan" description="Semua kode lama tidak berlaku lagi.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(code);
        }}
      >
        <CodeInput value={code} onValueChange={setCode} recovery autoFocus />
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!codeReady(code)}>
            Buat kode baru
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DisableModal({ vaultAccounts, onClose }: { vaultAccounts: number; onClose: () => void }) {
  const disable = useDisableTwoFactor();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  return (
    <Modal isOpen onClose={onClose} title="Matikan verifikasi dua langkah" description="Akun Anda hanya dilindungi kata sandi.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          disable.mutate({ password, code }, { onSuccess: onClose });
        }}
      >
        {vaultAccounts > 0 && (
          <p className="rounded-2xl bg-amber-400/20 p-3 text-sm text-amber-800">
            Anda penanggung jawab {vaultAccounts} akun di brankas. Setelah dimatikan, akun itu tidak bisa diubah sampai
            verifikasi dua langkah diaktifkan lagi.
          </p>
        )}
        <Input label="Kata sandi" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <CodeInput value={code} onValueChange={setCode} recovery />
        <ErrorText error={disable.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant="danger" loading={disable.isPending} disabled={!password || !codeReady(code)}>
            Matikan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
