"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { Suspense, useEffect, useState } from "react";
import { callAPI } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse, AuthDataResponse } from "@/types/global";
import { ACCESS_ROLE_DESCRIPTION, ACCESS_ROLE_LABEL, formatDate } from "@/utilities/labels";
import { Button, Input } from "../../(admin)/_components/ui";
import { buttonClasses } from "../../(admin)/_components/ui/button-classes";
import { AuthShell, Notice } from "../_components/AuthShell";
import { PasswordFields, passwordPairError, type PasswordPair } from "../_components/PasswordFields";
import { landingPathFor } from "../_components/redirect";
import { useLinkToken } from "../_components/useTokenAction";
import type { AcceptInviteInterface, InvitePreviewResponse } from "../types";

type Preview = { kind: "loading" } | { kind: "ready"; invite: InvitePreviewResponse } | { kind: "invalid"; message: string };

function AcceptInvite() {
  const router = useRouter();
  const token = useLinkToken();
  const url = useUrlStore((state) => state.URL.APP);
  const setUser = useAuthStore((state) => state.setUser);

  const [preview, setPreview] = useState<Preview>({ kind: "loading" });
  const [fullName, setFullName] = useState("");
  const [passwords, setPasswords] = useState<PasswordPair>({ password: "", confirm: "" });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    callAPI<ApiResponse<InvitePreviewResponse>>(`${url}/api/v1/auth/invite/${encodeURIComponent(token)}`)
      .then((res) => {
        setPreview({ kind: "ready", invite: res.data });
        setFullName(res.data.full_name);
      })
      .catch((err: unknown) =>
        setPreview({ kind: "invalid", message: err instanceof Error ? err.message : "Undangan tidak dapat dibuka." })
      );
  }, [token, url]);

  const nameError = touched && fullName.trim().length < 2 ? "Minimal 2 karakter." : undefined;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (fullName.trim().length < 2 || passwordPairError(passwords)) return;
    const body: AcceptInviteInterface = { token, full_name: fullName.trim(), password: passwords.password };
    setSubmitting(true);
    setError(null);
    try {
      const res = await callAPI<ApiResponse<AuthDataResponse>>(`${url}/api/v1/auth/accept-invite`, { method: "POST", body: JSON.stringify(body) });
      setUser(res.data.user);
      router.replace(landingPathFor(res.data.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menerima undangan.");
      setSubmitting(false);
    }
  };

  const shown: Preview = token ? preview : { kind: "invalid", message: "Tautan undangan tidak lengkap. Buka lagi dari email Anda." };

  if (shown.kind === "loading") {
    return <AuthShell title="Membuka undangan…">{null}</AuthShell>;
  }

  if (shown.kind === "invalid") {
    return (
      <AuthShell title="Undangan tidak berlaku" subtitle="Undangan berlaku 7 hari dan hanya bisa dipakai sekali.">
        <Notice tone="error">{shown.message}</Notice>
        <p className="text-sm text-muted">Minta admin organisasi Anda mengirim ulang undangan dari halaman Pengguna.</p>
        <Link href="/login" className={`${buttonClasses("secondary", "lg")} w-full`}>
          Ke halaman masuk
        </Link>
      </AuthShell>
    );
  }

  const { invite } = shown;
  return (
    <AuthShell
      title={<>Bergabung ke {invite.organization_name}</>}
      subtitle={<>{invite.inviter_name} mengundang Anda ke MBUTI. Buat kata sandi untuk mulai.</>}
    >
      <div className="rounded-2xl bg-canvas border border-line p-3 text-sm space-y-1">
        <p className="text-muted">
          Email: <strong className="text-ink">{invite.email}</strong>
        </p>
        <p className="text-muted">
          Hak akses: <strong className="text-ink">{ACCESS_ROLE_LABEL[invite.access_role]}</strong>
        </p>
        <p className="text-[11px] text-faint">{ACCESS_ROLE_DESCRIPTION[invite.access_role]}</p>
        <p className="text-[11px] text-faint">Berlaku sampai {formatDate(invite.expires_at)}.</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="Nama lengkap"
          autoComplete="name"
          required
          maxLength={150}
          value={fullName}
          error={nameError}
          onChange={(e) => setFullName(e.target.value)}
        />
        <PasswordFields value={passwords} onChange={setPasswords} touched={touched} />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Terima undangan
        </Button>
      </form>
    </AuthShell>
  );
}

/** useSearchParams adalah data saat permintaan; dibungkus Suspense agar halaman bisa diprerender. */
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AuthShell title="Membuka undangan…">{null}</AuthShell>}>
      <AcceptInvite />
    </Suspense>
  );
}
