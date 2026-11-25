"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { callAPI } from "@/lib/api";
import { DEMO_ACCOUNT } from "@/lib/mock";
import { isMockMode } from "@/lib/transport";
import { useAuthStore } from "@/store/useAuthStore";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse, AuthDataResponse } from "@/types/global";
import { Button, Input } from "../../(admin)/_components/ui";
import { BrandMark } from "../../(admin)/_components/brand-mark";

export default function LoginPage() {
  const router = useRouter();
  const loginUrl = useUrlStore((state) => state.URL.LOGIN);
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = async (credentials: { email: string; password: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await callAPI<ApiResponse<AuthDataResponse>>(loginUrl, {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      setUser(res.data.user);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk. Coba lagi.");
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    signIn({ email, password });
  };

  return (
    <main className="flex-1 grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between p-12 bg-brand text-white relative overflow-hidden">
        <div
          className="absolute -right-24 -bottom-24 w-[28rem] h-[28rem] rounded-[4rem] bg-white/10 rotate-12"
          aria-hidden="true"
        />
        <div
          className="absolute right-24 top-24 w-40 h-40 rounded-3xl bg-accent/80 -rotate-6"
          aria-hidden="true"
        />
        <Link href="/" className="flex items-center gap-3 relative">
          <span className="bg-white rounded-xl p-1">
            <BrandMark size={34} />
          </span>
          <span className="text-lg font-bold tracking-wide">MBUTI</span>
        </Link>
        <div className="relative space-y-4 max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-balance">
            Kantor AI yang bekerja dari SOP Anda.
          </h2>
          <p className="text-white/80 leading-relaxed">
            Susun role, unggah panduan kerja, atur siapa memeriksa siapa. Setiap hasil menyertakan
            rujukan dokumen, dan keputusan akhir tetap di tangan manusia.
          </p>
        </div>
        <p className="relative text-xs text-white/60">Multi-agent Business &amp; Unified Task Intelligence</p>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-8">
        <div className="glass w-full max-w-md rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <div className="lg:hidden mb-4">
              <BrandMark size={40} />
            </div>
            <h1 className="text-2xl font-bold text-ink">Masuk</h1>
            <p className="text-sm text-muted">Gunakan akun organisasi Anda.</p>
          </div>

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
            <Input
              label="Kata sandi"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" loading={submitting} disabled={!email || !password}>
              Masuk
            </Button>
          </form>

          {isMockMode() && (
            <div className="rounded-2xl bg-accent-soft border border-accent/30 p-4 space-y-3">
              <p className="text-xs text-amber-900 leading-relaxed">
                Mode data contoh aktif. Belum ada backend; semua data tersimpan di peramban ini.
              </p>
              <Button
                variant="accent"
                size="sm"
                className="w-full"
                disabled={submitting}
                onClick={() => signIn(DEMO_ACCOUNT)}
              >
                Masuk dengan akun demo
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
