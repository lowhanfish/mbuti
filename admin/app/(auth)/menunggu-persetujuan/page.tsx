"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { fetchData } from "@/lib/api_secure";
import { isMockMode } from "@/lib/transport";
import { useAuthStore } from "@/store/useAuthStore";
import { useUrlStore } from "@/store/useUrlStore";
import { Button } from "../../(admin)/_components/ui";
import { AuthShell, Notice } from "../_components/AuthShell";

/** Organisasi baru menunggu persetujuan pengelola platform (atau sedang ditangguhkan). */
export default function PendingApprovalPage() {
  const router = useRouter();
  const url = useUrlStore((state) => state.URL.APP);
  const user = useAuthStore((state) => state.user);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const logout = useAuthStore((state) => state.logout);
  const [checking, setChecking] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);

  const recheck = async (manual: boolean) => {
    setChecking(true);
    const current = await checkAuth();
    setChecking(false);
    if (!current) router.replace("/login");
    else if (current.organization?.status === "active") router.replace("/admin");
    else if (manual) setStillWaiting(true);
  };

  useEffect(() => {
    // Sekali saat halaman dibuka; pemeriksaan berikutnya lewat tombol
    checkAuth().then((current) => {
      if (!current) router.replace("/login");
      else if (current.organization?.status === "active") router.replace("/admin");
    });
  }, [checkAuth, router]);

  const approveForDemo = async () => {
    setChecking(true);
    try {
      await fetchData(`${url}/api/v1/mock/approve-organization`, { method: "POST" });
    } finally {
      await recheck(false);
    }
  };

  const suspended = user?.organization?.status === "suspended";
  const organizationName = user?.organization?.name ?? "Organisasi Anda";

  return (
    <AuthShell
      title={suspended ? "Organisasi ditangguhkan" : "Menunggu persetujuan ⏳"}
      subtitle={
        suspended ? (
          <>Akses <strong className="text-ink">{organizationName}</strong> ke MBUTI sedang ditangguhkan.</>
        ) : (
          <>Email Anda sudah terverifikasi. <strong className="text-ink">{organizationName}</strong> sedang kami tinjau.</>
        )
      }
    >
      {suspended ? (
        <Notice tone="error">Data organisasi tetap tersimpan. Hubungi pengelola MBUTI untuk membukanya kembali.</Notice>
      ) : (
        <Notice>
          Selama masa uji coba, akses dibuka bertahap agar kuota model AI cukup untuk semua. Kami memberi tahu lewat
          email setelah organisasi disetujui.
        </Notice>
      )}
      {stillWaiting && <Notice tone="info">Belum ada perubahan. Coba lagi nanti.</Notice>}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" loading={checking} onClick={() => recheck(true)}>
          Periksa lagi
        </Button>
        <Button variant="ghost" onClick={logout}>
          Keluar
        </Button>
      </div>

      {isMockMode() && !suspended && (
        <div className="rounded-2xl bg-gradient-to-br from-accent-soft to-surface border border-accent/30 p-4 space-y-3">
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>Mode data contoh.</strong> Di backend, pengelola menyetujui lewat skrip{" "}
            <code className="font-mono">scripts.setujui_organisasi</code>.
          </p>
          <Button variant="dark" className="w-full" disabled={checking} onClick={approveForDemo}>
            Setujui sebagai pengelola (simulasi)
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
