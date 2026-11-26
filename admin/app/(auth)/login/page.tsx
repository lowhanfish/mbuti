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
import { BackgroundOrbs, BrandMark, BrandMascot } from "../../(admin)/_components/brand-mark";

const HIGHLIGHTS = ["Role bekerja dari SOP", "Hasil saling diperiksa", "Keputusan tetap di manusia"];

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
    <main className="flex-1 grid lg:grid-cols-[1.1fr_1fr]">
      <BackgroundOrbs />

      <section className="hidden lg:flex flex-col justify-between p-10 m-3 rounded-4xl bg-linear-to-br from-ink via-[#241a45] to-[#3b2580] text-white relative overflow-hidden">
        <div className="absolute -left-20 top-1/3 w-80 h-80 rounded-full bg-brand/40 blur-3xl" aria-hidden="true" />
        <div className="absolute right-0 -bottom-20 w-96 h-96 rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />

        <Link href="/" className="flex items-center gap-3 relative">
          <BrandMark size={40} />
          <span className="text-lg font-extrabold tracking-wide">
            MBUTI<span className="text-accent">.</span>
          </span>
        </Link>

        <div className="relative flex justify-center">
          <BrandMascot width={400} />
        </div>

        <div className="relative space-y-4 max-w-lg">
          <h2 className="text-3xl font-bold leading-tight text-balance">
            Kantor AI yang bekerja <span className="text-accent">dari SOP Anda.</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {HIGHLIGHTS.map((item) => (
              <span key={item} className="text-xs font-medium rounded-full bg-white/10 border border-white/15 px-3 py-1.5 backdrop-blur">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-8">
        <div className="glass ring-gradient w-full max-w-md rounded-[28px] p-6 sm:p-8 space-y-6 rise">
          <div className="space-y-2">
            <div className="lg:hidden mb-4">
              <BrandMark size={52} />
            </div>
            <h1 className="text-3xl font-bold text-ink tracking-tight">Selamat datang 👋</h1>
            <p className="text-sm text-muted">Masuk untuk mengatur kantor AI organisasi Anda.</p>
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
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 rise" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!email || !password}>
              Masuk
            </Button>
          </form>

          {isMockMode() && (
            <div className="rounded-2xl bg-gradient-to-br from-accent-soft to-white border border-accent/30 p-4 space-y-3">
              <p className="text-xs text-amber-900 leading-relaxed">
                <strong>Mode data contoh.</strong> Belum ada backend; semua data tersimpan di peramban ini.
              </p>
              <Button variant="dark" size="md" className="w-full" disabled={submitting} onClick={() => signIn(DEMO_ACCOUNT)}>
                🐝 Masuk dengan akun demo
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
