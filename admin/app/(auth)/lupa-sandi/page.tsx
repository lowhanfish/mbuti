"use client";

import React, { useState } from "react";
import { callAPI } from "@/lib/api";
import { isMockMode } from "@/lib/transport";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import { Button, Input } from "../../(admin)/_components/ui";
import { Icon } from "../../(admin)/_components/admin-icons";
import { AuthShell, Eyebrow, FooterLink, Notice, Wave } from "../_components/AuthShell";
import { EMAIL_PATTERN, type EmailInterface } from "../types";

export default function ForgotPasswordPage() {
  const url = useUrlStore((state) => state.URL.APP);
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailError = touched && !EMAIL_PATTERN.test(email.trim()) ? "Format email tidak valid." : undefined;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!EMAIL_PATTERN.test(email.trim())) return;
    const body: EmailInterface = { email: email.trim().toLowerCase() };
    setSubmitting(true);
    setError(null);
    try {
      const res = await callAPI<ApiResponse<null>>(`${url}/api/v1/auth/forgot-password`, { method: "POST", body: JSON.stringify(body) });
      setSentMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Permintaan gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sentMessage) {
    return (
      <AuthShell
        eyebrow={<Eyebrow tone="success">Tautan dikirim</Eyebrow>}
        title={
          <>
            Periksa email Anda <Wave>📬</Wave>
          </>
        } subtitle="Tautan atur ulang berlaku 1 jam dan hanya bisa dipakai sekali.">
        <Notice tone="success">{sentMessage}</Notice>
        {isMockMode() && <Notice>Mode data contoh: buka email lewat tombol <strong>Kotak keluar</strong> di kanan bawah.</Notice>}
        <Button variant="secondary" className="w-full" onClick={() => setSentMessage(null)}>
          Pakai email lain
        </Button>
        <FooterLink text="Sudah ingat?" href="/login" label="Masuk" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={<Eyebrow tone="brand">Tenang, bisa dipulihkan</Eyebrow>}
      title={
        <>
          Lupa kata sandi? <Wave>🔑</Wave>
        </>
      } subtitle="Isi email akun Anda. Kami kirim tautan untuk membuat kata sandi baru.">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          error={emailError}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@instansi.go.id"
          leftIcon={<Icon name="mail" size={16} />}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" className="w-full auth-shine" loading={submitting}>
          Kirim tautan
          <Icon name="arrow" size={18} />
        </Button>
      </form>
      <FooterLink text="Sudah ingat?" href="/login" label="Masuk" />
    </AuthShell>
  );
}
