"use client";

import React, { useEffect, useState } from "react";
import { Button, CodeInput, Input, Modal, Textarea, codeReady } from "../../../_components/ui";
import { useConfirmVaultAccount, useDeleteVaultAccount, useSaveVaultAccount, useVaultCode } from "../hooks/vault";
import { VAULT_MAX_OTHER_URLS, type VaultAccount, type VaultCode } from "../vault-types";

const ErrorText = ({ error }: { error: unknown }) =>
  error instanceof Error ? (
    <p role="alert" className="text-sm font-medium text-red-600">
      {error.message}
    </p>
  ) : null;

const originOf = (value: string) => {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return "";
  }
};

export function VaultFormModal({ roleId, account, onClose }: { roleId: string; account: VaultAccount | null; onClose: () => void }) {
  const save = useSaveVaultAccount(roleId, account?.id ?? null);
  const [name, setName] = useState(account?.name ?? "");
  const [url, setUrl] = useState(account?.url ?? "");
  const [others, setOthers] = useState(account?.other_urls.join("\n") ?? "");
  const [username, setUsername] = useState(account?.username ?? "");
  const [password, setPassword] = useState("");
  const [totpKey, setTotpKey] = useState("");
  const [removeTotp, setRemoveTotp] = useState(false);
  const [code, setCode] = useState("");

  const otherUrls = others.split("\n").map((v) => v.trim()).filter(Boolean);
  // Alamat situs baru mewajibkan password diisi ulang agar tidak bisa dialihkan diam-diam
  const known = account ? new Set([account.url, ...account.other_urls].map(originOf)) : null;
  const siteChanged = known !== null && [url, ...otherUrls].some((v) => v && !known.has(originOf(v)));
  const passwordRequired = !account || siteChanged;
  const ready = name.trim() && url.trim() && username.trim() && (!passwordRequired || password) && codeReady(code);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    save.mutate(
      { name, url, other_urls: otherUrls, username, password, totp_key: totpKey, remove_totp: removeTotp, code },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={account ? `Ubah akun ${account.name}` : "Tambah akun aplikasi"} description="Disimpan terenkripsi. Password tidak bisa dilihat lagi setelah disimpan.">
      <form className="space-y-4" onSubmit={submit} autoComplete="off">
        <Input label="Nama aplikasi" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Aplikasi Kinerja" />
        <Input
          label="Alamat halaman masuk"
          required
          type="url"
          maxLength={500}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://aplikasi.contoh.go.id/masuk"
          helperText="Program hanya mengisi password di situs yang terdaftar di sini."
        />
        <Textarea
          label="Alamat lain yang diizinkan"
          rows={2}
          value={others}
          onChange={(e) => setOthers(e.target.value)}
          helperText={`Opsional, satu per baris (maksimal ${VAULT_MAX_OTHER_URLS}), mis. halaman masuk terpusat.`}
        />
        <Input label="Username" required maxLength={200} autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Input
          label={account ? "Password baru" : "Password"}
          type="password"
          autoComplete="new-password"
          required={passwordRequired}
          maxLength={500}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helperText={siteChanged ? "Alamat situs berubah: isi ulang password." : account ? "Kosongkan bila tidak diganti." : undefined}
        />
        <Input
          label="Kunci authenticator aplikasi ini"
          autoComplete="off"
          spellCheck={false}
          maxLength={500}
          value={totpKey}
          disabled={removeTotp}
          onChange={(e) => setTotpKey(e.target.value)}
          placeholder={account?.has_totp ? "Sudah tersimpan" : "Opsional"}
          helperText="Kunci huruf-angka atau alamat otpauth:// yang diberikan aplikasi saat mengaktifkan OTP."
        />
        {account?.has_totp && (
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={removeTotp} onChange={(e) => setRemoveTotp(e.target.checked)} className="w-4 h-4 accent-[var(--color-brand)]" />
            Hapus kunci authenticator yang tersimpan
          </label>
        )}
        <div className="border-t border-line pt-4">
          <CodeInput label="Kode verifikasi MBUTI Anda" value={code} onValueChange={setCode} recovery helperText="Kode dari authenticator untuk akun MBUTI, bukan aplikasi tujuan." />
        </div>
        <ErrorText error={save.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!ready}>
            Simpan
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Hapus atau konfirmasi akun: cukup kode verifikasi. */
export function VaultActionModal({ roleId, account, action, onClose }: { roleId: string; account: VaultAccount; action: "delete" | "confirm"; onClose: () => void }) {
  const remove = useDeleteVaultAccount(roleId);
  const confirm = useConfirmVaultAccount(roleId);
  const mutation = action === "delete" ? remove : confirm;
  const [code, setCode] = useState("");

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={action === "delete" ? `Hapus akun ${account.name}?` : `Konfirmasi akun ${account.name}`}
      description={
        action === "delete"
          ? "Username, password, dan kunci authenticator dihapus dan tidak bisa dikembalikan."
          : "Penanggung jawab role berganti. Setelah Anda konfirmasi, role boleh memakai akun ini lagi."
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ id: account.id, code }, { onSuccess: onClose });
        }}
      >
        {action === "confirm" && (
          <p className="text-sm text-muted break-words">
            Pastikan alamat ini benar: <strong className="text-ink">{account.url}</strong>
          </p>
        )}
        <CodeInput label="Kode verifikasi MBUTI Anda" value={code} onValueChange={setCode} recovery autoFocus />
        <ErrorText error={mutation.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant={action === "delete" ? "danger" : "primary"} loading={mutation.isPending} disabled={!codeReady(code)}>
            {action === "delete" ? "Hapus" : "Konfirmasi"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Kode authenticator aplikasi tujuan, mis. untuk menyelesaikan pengaktifan OTP di aplikasi itu. */
export function VaultCodeModal({ roleId, account, onClose }: { roleId: string; account: VaultAccount; onClose: () => void }) {
  const show = useVaultCode(roleId);
  const [code, setCode] = useState("");
  const [shown, setShown] = useState<VaultCode | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!shown) return;
    const until = Date.now() + shown.expires_in * 1000;
    const timer = setInterval(() => {
      const seconds = Math.ceil((until - Date.now()) / 1000);
      if (seconds <= 0) {
        setShown(null);
        setCode("");
      } else setLeft(seconds);
    }, 500);
    return () => clearInterval(timer);
  }, [shown]);

  return (
    <Modal isOpen onClose={onClose} title={`Kode authenticator ${account.name}`} description="Untuk dimasukkan di aplikasi tujuan. Setiap tampilan tercatat di jejak audit.">
      {shown ? (
        <div className="text-center space-y-2">
          <p className="font-mono text-4xl font-bold tracking-[0.3em] text-ink select-all" aria-label="Kode authenticator">
            {shown.code}
          </p>
          <p className="text-sm text-muted" aria-live="polite">
            Berganti dalam {left} detik.
          </p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            show.mutate(
              { id: account.id, code },
              {
                onSuccess: (res) => {
                  setLeft(res.data.expires_in);
                  setShown(res.data);
                },
              }
            );
          }}
        >
          <CodeInput label="Kode verifikasi MBUTI Anda" value={code} onValueChange={setCode} recovery autoFocus />
          <ErrorText error={show.error} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" loading={show.isPending} disabled={!codeReady(code)}>
              Tampilkan kode
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
