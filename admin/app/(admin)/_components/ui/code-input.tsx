"use client";

import React from "react";
import { Input, type InputProps } from "./input";

/** Isian kode dari aplikasi authenticator, atau kode cadangan bila `recovery`. */
export function CodeInput({
  value,
  onValueChange,
  recovery = false,
  label = "Kode verifikasi",
  ...props
}: Omit<InputProps, "value" | "onChange"> & { value: string; onValueChange: (value: string) => void; recovery?: boolean }) {
  return (
    <Input
      label={label}
      inputMode={recovery ? "text" : "numeric"}
      autoComplete="one-time-code"
      spellCheck={false}
      maxLength={recovery ? 20 : 7}
      placeholder={recovery ? "6 angka atau kode cadangan" : "6 angka"}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="tracking-[0.25em] font-mono placeholder:tracking-normal placeholder:font-sans"
      {...props}
    />
  );
}

/** Kode sudah cukup panjang untuk dikirim. */
export const codeReady = (value: string) => value.replace(/\s/g, "").length >= 6;
