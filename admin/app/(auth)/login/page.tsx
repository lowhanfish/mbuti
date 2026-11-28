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
import { Icon } from "../../(admin)/_components/admin-icons";
import { Button, CodeInput, Input, codeReady } from "../../(admin)/_components/ui";
import { AuthShell, Eyebrow, FooterLink, Notice, Wave } from "../_components/AuthShell";
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
  const [showPassword, setShowPassword] = useState(false);
  // Diminta server bila akun memakai verifikasi dua langkah
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  const signIn = async (credentials: { email: string; password: string; code?: string }) => {
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
      if (err instanceof ApiError && err.code === "two_factor_required") {
        setNeedsCode(true);
        setSubmitting(false);
        return;
      }
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
    signIn({ email, password, ...(needsCode ? { code } : {}) });
  };

  return (
    <AuthShell
      eyebrow={<Eyebrow>Tim AI Anda sudah siap bekerja</Eyebrow>}
      title={
        <>
          Selamat datang <Wave />
        </>
      }
      subtitle="Masuk untuk mengatur kantor AI organisasi Anda."
    >
      <form className="relative space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@instansi.go.id"
          leftIcon={<Icon name="mail" size={16} />}
        />
        <div className="space-y-1.5">
          <Input
            label="Kata sandi"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            leftIcon={<Icon name="lock" size={16} />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-faint hover:text-brand cursor-pointer"
                aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
              </button>
            }
          />
          <div className="text-right">
            <Link href="/lupa-sandi" className="text-xs font-semibold text-brand hover:underline">
              Lupa kata sandi?
            </Link>
          </div>
        </div>

        {needsCode && (
          <CodeInput
            value={code}
            onValueChange={setCode}
            recovery
            autoFocus
            helperText="Buka aplikasi authenticator, atau pakai salah satu kode cadangan."
          />
        )}

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

        <Button type="submit" size="lg" className="w-full auth-shine" loading={submitting} disabled={!email || !password || (needsCode && !codeReady(code))}>
          Masuk
          <Icon name="arrow" size={18} />
        </Button>
      </form>

      <div className="relative flex items-center gap-3 text-[11px] text-faint" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span>atau</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <FooterLink text="Belum punya akun?" href="/daftar" label="Daftarkan organisasi" />

      <div className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="shield" size={13} className="text-brand" />
          Sesi aman, kata sandi tidak disimpan apa adanya
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="building" size={13} className="text-accent-strong" />
          Data tiap organisasi terpisah
        </span>
      </div>

      {isMockMode() && (
        <div className="rounded-2xl bg-gradient-to-br from-accent-soft to-surface border border-accent/30 p-4 space-y-3">
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>Mode data contoh.</strong> Belum ada backend; semua data tersimpan di peramban ini.
          </p>
          <Button variant="dark" size="md" className="w-full" disabled={submitting} onClick={() => signIn({ ...DEMO_ACCOUNT, ...(needsCode ? { code } : {}) })}>
            🐝 Masuk dengan akun demo
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
