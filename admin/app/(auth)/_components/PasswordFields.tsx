"use client";

import React from "react";
import { Input } from "../../(admin)/_components/ui";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../types";

export interface PasswordPair {
  password: string;
  confirm: string;
}

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
  return (
    <>
      <Input
        label={label}
        type="password"
        autoComplete="new-password"
        required
        maxLength={PASSWORD_MAX_LENGTH}
        value={value.password}
        error={errors && "password" in errors ? errors.password : undefined}
        helperText={`Minimal ${PASSWORD_MIN_LENGTH} karakter. Kalimat pendek yang mudah Anda ingat lebih kuat daripada kata acak yang pendek.`}
        onChange={(e) => onChange({ ...value, password: e.target.value })}
      />
      <Input
        label="Ulangi kata sandi"
        type="password"
        autoComplete="new-password"
        required
        maxLength={PASSWORD_MAX_LENGTH}
        value={value.confirm}
        error={errors && "confirm" in errors ? errors.confirm : undefined}
        onChange={(e) => onChange({ ...value, confirm: e.target.value })}
      />
    </>
  );
}
