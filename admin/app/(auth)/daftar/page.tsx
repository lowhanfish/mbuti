"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { callAPI } from "@/lib/api";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import { SECTOR_OPTIONS, type OrganizationSector } from "../../(admin)/admin/organisasi/profil/types";
import { Button, Input, Select } from "../../(admin)/_components/ui";
import { Icon } from "../../(admin)/_components/admin-icons";
import { AuthShell, Eyebrow, FooterLink, Notice, Wave } from "../_components/AuthShell";
import { PasswordFields, passwordPairError, type PasswordPair } from "../_components/PasswordFields";
import { rememberEmail } from "../_components/pending-email";
import { EMAIL_PATTERN, type AuthOptionsResponse, type RegisterInterface, type RegistrationMode } from "../types";

interface FormState {
  full_name: string;
  email: string;
  organization_name: string;
  sector: OrganizationSector;
  accept_terms: boolean;
}

const EMPTY: FormState = { full_name: "", email: "", organization_name: "", sector: "pemerintahan", accept_terms: false };

export default function RegisterPage() {
  const router = useRouter();
  const url = useUrlStore((state) => state.URL.APP);

  const [mode, setMode] = useState<RegistrationMode | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [passwords, setPasswords] = useState<PasswordPair>({ password: "", confirm: "" });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    callAPI<ApiResponse<AuthOptionsResponse>>(`${url}/api/v1/auth/options`)
      .then((res) => setMode(res.data.registration))
      // Tanpa jawaban server, formulir tetap ditampilkan; server yang memutuskan saat dikirim
      .catch(() => setMode("approval"));
  }, [url]);

  const errors = touched
    ? {
        full_name: form.full_name.trim().length < 2 ? "Minimal 2 karakter." : undefined,
        email: EMAIL_PATTERN.test(form.email.trim()) ? undefined : "Format email tidak valid.",
        organization_name: form.organization_name.trim().length < 2 ? "Minimal 2 karakter." : undefined,
        accept_terms: form.accept_terms ? undefined : "Centang untuk melanjutkan.",
      }
    : {};

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    const valid =
      form.full_name.trim().length >= 2 &&
      EMAIL_PATTERN.test(form.email.trim()) &&
      form.organization_name.trim().length >= 2 &&
      form.accept_terms &&
      !passwordPairError(passwords);
    if (!valid) return;

    const body: RegisterInterface = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      password: passwords.password,
      organization_name: form.organization_name.trim(),
      sector: form.sector,
      accept_terms: true,
    };
    setSubmitting(true);
    setError(null);
    try {
      await callAPI<ApiResponse<null>>(`${url}/api/v1/auth/register`, { method: "POST", body: JSON.stringify(body) });
      rememberEmail(body.email);
      router.push("/daftar/terkirim");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pendaftaran gagal. Coba lagi.");
      setSubmitting(false);
    }
  };

  if (mode === "closed") {
    return (
      <AuthShell eyebrow={<Eyebrow tone="brand">Segera dibuka</Eyebrow>} title="Pendaftaran ditutup" subtitle="Saat ini akun baru dibuat oleh pengelola MBUTI.">
        <Notice>Bila organisasi Anda ingin mencoba MBUTI, hubungi pengelola. Anggota organisasi yang sudah ada bisa diundang oleh admin-nya.</Notice>
        <FooterLink text="Sudah punya akun?" href="/login" label="Masuk" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      wide
      eyebrow={<Eyebrow tone="brand">Masa uji coba · akses dibuka bertahap</Eyebrow>}
      title={
        <>
          Daftarkan organisasi <Wave>🐝</Wave>
        </>
      }
      subtitle="Buat akun pemilik dan ruang kerja organisasi Anda. Anggota lain bisa diundang setelahnya."
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nama lengkap"
            leftIcon={<Icon name="users" size={16} />}
            autoComplete="name"
            required
            maxLength={150}
            value={form.full_name}
            error={errors.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <Input
            label="Email kerja"
            leftIcon={<Icon name="mail" size={16} />}
            type="email"
            autoComplete="email"
            required
            maxLength={150}
            value={form.email}
            error={errors.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="nama@instansi.go.id"
          />
          <Input
            label="Nama organisasi"
            leftIcon={<Icon name="building" size={16} />}
            autoComplete="organization"
            required
            maxLength={150}
            value={form.organization_name}
            error={errors.organization_name}
            onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
            placeholder="Dinas, sekolah, atau perusahaan"
          />
          <Select
            label="Sektor"
            required
            options={SECTOR_OPTIONS}
            value={form.sector}
            onChange={(e) => setForm({ ...form, sector: e.target.value as OrganizationSector })}
          />
        </div>

        <PasswordFields value={passwords} onChange={setPasswords} touched={touched} />

        <label className="flex items-start gap-3 text-sm text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={form.accept_terms}
            onChange={(e) => setForm({ ...form, accept_terms: e.target.checked })}
            className="mt-0.5 w-4 h-4 accent-brand shrink-0"
            aria-invalid={errors.accept_terms ? true : undefined}
          />
          <span>
            Saya menyetujui{" "}
            <Link href="/ketentuan" target="_blank" className="font-semibold text-brand hover:underline">
              ketentuan layanan
            </Link>{" "}
            dan{" "}
            <Link href="/privasi" target="_blank" className="font-semibold text-brand hover:underline">
              kebijakan privasi
            </Link>
            .
            {errors.accept_terms && <span className="block text-xs text-rose-600 mt-1">{errors.accept_terms}</span>}
          </span>
        </label>

        {mode === "approval" && (
          <Notice>
            Setelah email diverifikasi, organisasi Anda kami tinjau dulu. Selama masa uji coba, akses dibuka bertahap.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        <Button type="submit" size="lg" className="w-full auth-shine" loading={submitting} disabled={mode === null}>
          Daftar
          <Icon name="arrow" size={18} />
        </Button>
      </form>

      <FooterLink text="Sudah punya akun?" href="/login" label="Masuk" />
    </AuthShell>
  );
}
