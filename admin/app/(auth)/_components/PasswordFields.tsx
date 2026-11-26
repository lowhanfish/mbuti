"use client";

import React, { useState } from "react";
import { Icon } from "../../(admin)/_components/admin-icons";
import { Input } from "../../(admin)/_components/ui";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../types";

export interface PasswordPair {
  password: string;
  confirm: string;
}

/** Perkiraan kasar kekuatan kata sandi, hanya sebagai petunjuk bagi pengguna. */
export const passwordStrength = (password: string) => {
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password) || /\s/.test(password)) score += 1;
  if (password.length < PASSWORD_MIN_LENGTH) score = Math.min(score, 1);
  const levels = [
    { label: "terlalu pendek", bar: "bg-rose-500" },
    { label: "lemah", bar: "bg-rose-500" },
    { label: "cukup", bar: "bg-amber-400" },
    { label: "kuat", bar: "bg-emerald-500" },
    { label: "sangat kuat", bar: "bg-emerald-500" },
  ];
  return { score, ...levels[score] };
};

/** Pesan galat untuk pasangan kata sandi; null bila sudah benar. */
export const passwordPairError = ({ password, confirm }: PasswordPair) => {
  if (password.length < PASSWORD_MIN_LENGTH) return { password: `Minimal ${PASSWORD_MIN_LENGTH} karakter.` };
  if (password.length > PASSWORD_MAX_LENGTH) return { password: `Maksimal ${PASSWORD_MAX_LENGTH} karakter.` };
  if (password !== confirm) return { confirm: "Kedua kata sandi tidak sama." };
  return null;
};

/** Kata sandi baru dan ulangannya. `touched` menampilkan galat setelah formulir pernah dikirim. */
export function PasswordFields({
  value,
  onChange,
  touched,
  label = "Kata sandi",
}: {
  value: PasswordPair;
  onChange: (value: PasswordPair) => void;
  touched: boolean;
  label?: string;
}) {
  const errors = touched ? passwordPairError(value) : null;
  const [visible, setVisible] = useState(false);
  const type = visible ? "text" : "password";
  const toggle = (
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      className="text-faint hover:text-brand cursor-pointer"
      aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
      title={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
    >
      <Icon name={visible ? "eye-off" : "eye"} size={16} />
    </button>
  );
  const strength = passwordStrength(value.password);
  return (
    <>
      <Input
        label={label}
        type={type}
        autoComplete="new-password"
        required
        maxLength={PASSWORD_MAX_LENGTH}
        leftIcon={<Icon name="lock" size={16} />}
        rightIcon={toggle}
        value={value.password}
        error={errors && "password" in errors ? errors.password : undefined}
        helperText={`Minimal ${PASSWORD_MIN_LENGTH} karakter. Kalimat pendek yang mudah Anda ingat lebih kuat daripada kata acak yang pendek.`}
        onChange={(e) => onChange({ ...value, password: e.target.value })}
      />
      {value.password && (
        <div className="-mt-2 space-y-1" aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength.score ? strength.bar : "bg-line"}`} />
            ))}
          </div>
          <p className="text-[11px] text-faint">Kekuatan: {strength.label}</p>
        </div>
      )}
      <Input
        label="Ulangi kata sandi"
        type={type}
        autoComplete="new-password"
        required
        maxLength={PASSWORD_MAX_LENGTH}
        leftIcon={<Icon name="check" size={16} />}
        value={value.confirm}
        error={errors && "confirm" in errors ? errors.confirm : undefined}
        onChange={(e) => onChange({ ...value, confirm: e.target.value })}
      />
    </>
  );
}
