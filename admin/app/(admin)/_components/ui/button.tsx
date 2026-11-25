"use client";

import React from "react";
import { buttonClasses } from "./button-classes";

export { buttonClasses };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "accent" | "dark";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClasses(variant, size)} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
      ) : (
        icon && <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}

/** Tombol ikon bulat untuk aksi baris tabel atau kartu. */
export function IconButton({
  label,
  tone = "neutral",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "neutral" | "danger" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-xl inline-flex items-center justify-center transition-all cursor-pointer ${
        tone === "danger"
          ? "text-faint hover:text-rose-600 hover:bg-rose-50"
          : "text-faint hover:text-brand hover:bg-brand-soft"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
