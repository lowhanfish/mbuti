"use client";

import React, { useSyncExternalStore } from "react";
import { isMockMode } from "@/lib/transport";
import { AuthShell, FooterLink, Notice } from "../../_components/AuthShell";
import { ResendVerification } from "../../_components/ResendVerification";
import { recallEmail } from "../../_components/pending-email";

export default function RegisteredPage() {
  // null saat prerender di server; email dibaca dari sessionStorage setelah di peramban
  const email = useSyncExternalStore(noSubscribe, recallEmail, () => null);

  return (
    <AuthShell
      title="Periksa email Anda 📬"
      subtitle={
        email ? (
          <>
            Kami mengirim tautan verifikasi ke <strong className="text-ink">{email}</strong>. Tautan berlaku 24 jam.
          </>
        ) : (
          "Kami mengirim tautan verifikasi ke email yang Anda daftarkan. Tautan berlaku 24 jam."
        )
      }
    >
      <ol className="text-sm text-muted space-y-2 list-decimal pl-5">
        <li>Buka email dari MBUTI dan klik <strong className="text-ink">Verifikasi email</strong>.</li>
        <li>Organisasi Anda kami tinjau. Halaman akan memberi tahu bila sudah bisa dipakai.</li>
      </ol>
      <Notice>Tidak ada email dalam beberapa menit? Periksa folder spam, atau kirim ulang tautannya.</Notice>
      {isMockMode() && <Notice tone="success">Mode data contoh: buka email lewat tombol <strong>Kotak keluar</strong> di kanan bawah.</Notice>}
      {email !== null && <ResendVerification initialEmail={email} />}
      <FooterLink text="Sudah verifikasi?" href="/login" label="Masuk" />
    </AuthShell>
  );
}

const noSubscribe = () => () => {};
