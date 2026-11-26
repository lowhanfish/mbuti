"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { callAPI } from "@/lib/api";
import { DEMO_ACCOUNT } from "@/lib/mock";
import { ApiError, isMockMode } from "@/lib/transport";
import { useAuthStore } from "@/store/useAuthStore";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse, AuthDataResponse } from "@/types/global";
import { Button, Input } from "../../(admin)/_components/ui";
import { AuthShell, FooterLink, Notice } from "../_components/AuthShell";
import { landingPathFor } from "../_components/redirect";

export default function LoginPage() {
  const router = useRouter();
  const url = useUrlStore((state) => state.URL);
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = async (credentials: { email: string; password: string }) => {
    setSubmitting(true);
    setError(null);
    setUnverified(false);
    setResent(null);
    try {
      const res = await callAPI<ApiResponse<AuthDataResponse>>(url.LOGIN, {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      setUser(res.data.user);
      router.replace(landingPathFor(res.data.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk. Coba lagi.");
      setUnverified(err instanceof ApiError && err.code === "email_not_verified");
      setSubmitting(false);
    }
  };

  const resendVerification = async () => {
    setSubmitting(true);
    try {
      const res = await callAPI<ApiResponse<null>>(`${url.APP}/api/v1/auth/resend-verification`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setResent(res.message ?? "Tautan verifikasi dikirim ulang.");
      setError(null);
      setUnverified(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim ulang tautan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    signIn({ email, password });
  };

  return (
    <AuthShell title="Selamat datang 👋" subtitle="Masuk untuk mengatur kantor AI organisasi Anda.">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@instansi.go.id"
        />
        <div className="space-y-1.5">
          <Input
            label="Kata sandi"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="text-right">
            <Link href="/lupa-sandi" className="text-xs font-semibold text-brand hover:underline">
              Lupa kata sandi?
            </Link>
          </div>
        </div>

        {error && (
          <Notice tone="error">
            {error}
            {unverified && (
              <button
                type="button"
                onClick={resendVerification}
                disabled={submitting}
                className="block mt-1 font-semibold underline disabled:opacity-50"
              >
                Kirim ulang tautan verifikasi
              </button>
            )}
          </Notice>
        )}
        {resent && <Notice tone="success">{resent}</Notice>}

        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!email || !password}>
          Masuk
        </Button>
      </form>

      <FooterLink text="Belum punya akun?" href="/daftar" label="Daftarkan organisasi" />

      {isMockMode() && (
        <div className="rounded-2xl bg-gradient-to-br from-accent-soft to-surface border border-accent/30 p-4 space-y-3">
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>Mode data contoh.</strong> Belum ada backend; semua data tersimpan di peramban ini.
          </p>
          <Button variant="dark" size="md" className="w-full" disabled={submitting} onClick={() => signIn(DEMO_ACCOUNT)}>
            🐝 Masuk dengan akun demo
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
