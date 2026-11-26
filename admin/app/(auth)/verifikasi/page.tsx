"use client";

import { useRouter } from "next/navigation";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { callAPI } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse, AuthDataResponse } from "@/types/global";
import { AuthShell, FooterLink, Notice } from "../_components/AuthShell";
import { ResendVerification } from "../_components/ResendVerification";
import { landingPathFor } from "../_components/redirect";
import { useLinkToken } from "../_components/useTokenAction";

type State = { kind: "checking" } | { kind: "done"; next: string } | { kind: "failed"; message: string };

function VerifyEmail() {
  const router = useRouter();
  const token = useLinkToken();
  const url = useUrlStore((state) => state.URL.APP);
  const setUser = useAuthStore((state) => state.setUser);
  const [state, setState] = useState<State>({ kind: "checking" });
  // Token sekali pakai: jangan dikirim dua kali saat komponen dipasang ulang (React Strict Mode)
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !token) return;
    sent.current = true;
    callAPI<ApiResponse<AuthDataResponse>>(`${url}/api/v1/auth/verify-email`, { method: "POST", body: JSON.stringify({ token }) })
      .then((res) => {
        setUser(res.data.user);
        setState({ kind: "done", next: landingPathFor(res.data.user) });
      })
      .catch((err: unknown) =>
        setState({ kind: "failed", message: err instanceof Error ? err.message : "Verifikasi gagal. Coba lagi." })
      );
  }, [token, url, setUser]);

  useEffect(() => {
    if (state.kind !== "done") return;
    const timer = window.setTimeout(() => router.replace(state.next), 1500);
    return () => window.clearTimeout(timer);
  }, [state, router]);

  const shown: State = token ? state : { kind: "failed", message: "Tautan verifikasi tidak lengkap. Buka lagi dari email Anda." };

  if (shown.kind === "checking") {
    return <AuthShell title="Memeriksa tautan…" subtitle="Sebentar, email Anda sedang diverifikasi.">{null}</AuthShell>;
  }

  if (shown.kind === "done") {
    return (
      <AuthShell title="Email terverifikasi ✅" subtitle="Terima kasih. Anda sedang diarahkan…">
        <Notice tone="success">Akun Anda sudah aktif.</Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Tautan tidak berlaku" subtitle="Verifikasi belum berhasil.">
      <Notice tone="error">{shown.message}</Notice>
      <p className="text-sm text-muted">Isi email yang Anda daftarkan untuk menerima tautan baru.</p>
      <ResendVerification label="Kirim tautan baru" />
      <FooterLink text="Sudah terverifikasi?" href="/login" label="Masuk" />
    </AuthShell>
  );
}

/** useSearchParams adalah data saat permintaan; dibungkus Suspense agar halaman bisa diprerender. */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell title="Memeriksa tautan…">{null}</AuthShell>}>
      <VerifyEmail />
    </Suspense>
  );
}
