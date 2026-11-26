"use client";

import React, { useEffect, useState } from "react";
import { callAPI } from "@/lib/api";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import { Icon } from "../../(admin)/_components/admin-icons";
import { Button, Input } from "../../(admin)/_components/ui";
import { Notice } from "./AuthShell";
import { EMAIL_PATTERN } from "../types";

const COOLDOWN_S = 60;

/** Kirim ulang tautan verifikasi, dengan jeda agar tidak ditekan berulang-ulang. */
export function ResendVerification({ initialEmail = "", label = "Kirim ulang tautan" }: { initialEmail?: string; label?: string }) {
  const url = useUrlStore((state) => state.URL.APP);
  const [email, setEmail] = useState(initialEmail);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setMessage({ tone: "error", text: "Isi email yang dipakai saat mendaftar." });
      return;
    }
    setSending(true);
    try {
      const res = await callAPI<ApiResponse<null>>(`${url}/api/v1/auth/resend-verification`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setMessage({ tone: "success", text: res.message });
      setCooldown(COOLDOWN_S);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Gagal mengirim ulang tautan." });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={send} noValidate>
      {!initialEmail && (
        <Input label="Email" type="email" autoComplete="email" leftIcon={<Icon name="mail" size={16} />} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@instansi.go.id" />
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button type="submit" variant="secondary" className="w-full" loading={sending} disabled={cooldown > 0}>
        {cooldown > 0 ? `Kirim ulang dalam ${cooldown} detik` : label}
      </Button>
    </form>
  );
}
