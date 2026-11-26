"use client";

import Link from "next/link";
import React, { Suspense, useState } from "react";
import { callAPI } from "@/lib/api";
import { ApiError } from "@/lib/transport";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import { Button } from "../../(admin)/_components/ui";
import { buttonClasses } from "../../(admin)/_components/ui/button-classes";
import { Icon } from "../../(admin)/_components/admin-icons";
import { AuthShell, Eyebrow, FooterLink, Notice } from "../_components/AuthShell";
import { PasswordFields, passwordPairError, type PasswordPair } from "../_components/PasswordFields";
import { useLinkToken } from "../_components/useTokenAction";
import type { ResetPasswordInterface } from "../types";

function ResetPassword() {
  const token = useLinkToken();
  const url = useUrlStore((state) => state.URL.APP);
  const [passwords, setPasswords] = useState<PasswordPair>({ password: "", confirm: "" });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<{ text: string; linkBroken: boolean } | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (passwordPairError(passwords)) return;
    const body: ResetPasswordInterface = { token, password: passwords.password };
    setSubmitting(true);
    setError(null);
    try {
      const res = await callAPI<ApiResponse<null>>(`${url}/api/v1/auth/reset-password`, { method: "POST", body: JSON.stringify(body) });
      setDoneMessage(res.message);
    } catch (err) {
      setError({
        text: err instanceof Error ? err.message : "Gagal mengganti kata sandi.",
        linkBroken: err instanceof ApiError && err.code === "invalid_token",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (doneMessage) {
    return (
      <AuthShell eyebrow={<Eyebrow tone="success">Berhasil</Eyebrow>} title="Kata sandi diganti ✅" subtitle="Semua sesi lama sudah dikeluarkan demi keamanan.">
        <Notice tone="success">{doneMessage}</Notice>
        <Link href="/login" className={`${buttonClasses("primary", "lg")} w-full`}>
          Masuk
        </Link>
      </AuthShell>
    );
  }

  if (!token || error?.linkBroken) {
    return (
      <AuthShell eyebrow={<Eyebrow>Minta tautan baru</Eyebrow>} title="Tautan tidak berlaku" subtitle="Tautan atur ulang hanya berlaku 1 jam dan sekali pakai.">
        <Notice tone="error">{error?.text ?? "Tautan atur ulang tidak lengkap. Buka lagi dari email Anda."}</Notice>
        <Link href="/lupa-sandi" className={`${buttonClasses("primary", "lg")} w-full`}>
          Minta tautan baru
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={<Eyebrow tone="brand">Langkah terakhir</Eyebrow>} title="Buat kata sandi baru" subtitle="Setelah diganti, Anda perlu masuk lagi di semua perangkat.">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <PasswordFields value={passwords} onChange={setPasswords} touched={touched} label="Kata sandi baru" />
        {error && <Notice tone="error">{error.text}</Notice>}
        <Button type="submit" size="lg" className="w-full auth-shine" loading={submitting}>
          Simpan kata sandi
          <Icon name="arrow" size={18} />
        </Button>
      </form>
      <FooterLink text="Tidak jadi?" href="/login" label="Kembali ke halaman masuk" />
    </AuthShell>
  );
}

/** useSearchParams adalah data saat permintaan; dibungkus Suspense agar halaman bisa diprerender. */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Buat kata sandi baru">{null}</AuthShell>}>
      <ResetPassword />
    </Suspense>
  );
}
